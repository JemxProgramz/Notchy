$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName System.Runtime.WindowsRuntime

# WinRT types are only discoverable in Windows PowerShell 5.1 through their
# assembly-qualified, WindowsRuntime-projected names. Without the suffix the
# session manager type cannot be resolved and all media integration fails.
$ManagerType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
$PropertiesType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties, Windows.Media.Control, ContentType = WindowsRuntime]
$StreamType = [Windows.Storage.Streams.IRandomAccessStreamWithContentType, Windows.Storage.Streams, ContentType = WindowsRuntime]

$async = [System.WindowsRuntimeSystemExtensions].GetMethods()
$genericAsTask = $async | Where-Object {
  $_.Name -eq 'AsTask' -and $_.IsGenericMethodDefinition -and $_.GetParameters().Length -eq 1 -and
  $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
} | Select-Object -First 1
function Wait-Operation($operation, [type]$resultType) {
  $task = $genericAsTask.MakeGenericMethod($resultType).Invoke($null, @($operation))
  $task.GetAwaiter().GetResult()
}
function Send-State($state) {
  [Console]::Out.WriteLine(($state | ConvertTo-Json -Compress -Depth 3))
}
function Get-MediaSession {
  $current = $manager.GetCurrentSession()
  if ($current -and $current.SourceAppUserModelId -notmatch '(?i)notch') {
    $status = $current.GetPlaybackInfo().PlaybackStatus.ToString()
    if ($status -eq 'Playing' -or $status -eq 'Paused') { return $current }
  }
  $paused = $null
  foreach ($candidate in $manager.GetSessions()) {
    if ($candidate.SourceAppUserModelId -match '(?i)notch') { continue }
    try {
      $status = $candidate.GetPlaybackInfo().PlaybackStatus.ToString()
      if ($status -eq 'Playing') { return $candidate }
      if ($status -eq 'Paused' -and -not $paused) { $paused = $candidate }
    } catch { }
  }
  return $paused
}

try {
  $manager = Wait-Operation ($ManagerType::RequestAsync()) $ManagerType
  Send-State @{ supported = $true; active = $false }
} catch {
  Send-State @{ supported = $false; active = $false; error = $_.Exception.Message }
  exit 0
}

# [Console]::In is a synchronized reader whose ReadLineAsync() blocks the
# calling thread, which would stall the poll loop until a command arrived. A
# raw StreamReader over the standard input handle supports genuinely async,
# non-blocking reads so media state can stream while commands arrive.
$stdin = [System.IO.StreamReader]::new([Console]::OpenStandardInput())
$pendingInput = $null
$lastSignature = ''
$cover = $null
$pollClock = [System.Diagnostics.Stopwatch]::StartNew()
$nextPollAt = 0
while ($true) {
  if ($null -eq $pendingInput) { $pendingInput = $stdin.ReadLineAsync() }
  if ($pendingInput.IsCompleted) {
    $command = $pendingInput.GetAwaiter().GetResult()
    $pendingInput = $null
    if ($null -eq $command) { break }
    try {
      $name = $command.Trim()
      $session = Get-MediaSession
      if ($session) {
        if ($name -eq 'toggle') { Wait-Operation ($session.TryTogglePlayPauseAsync()) ([bool]) | Out-Null }
        elseif ($name -eq 'next') { Wait-Operation ($session.TrySkipNextAsync()) ([bool]) | Out-Null }
        elseif ($name -eq 'previous') { Wait-Operation ($session.TrySkipPreviousAsync()) ([bool]) | Out-Null }
        elseif ($name -match '^seek:(\d+)$') {
          $playbackInfo = $session.GetPlaybackInfo()
          if ($playbackInfo.Controls.IsPlaybackPositionEnabled) {
            $timeline = $session.GetTimelineProperties()
            $durationMs = [Math]::Max(0, ($timeline.EndTime - $timeline.StartTime).TotalMilliseconds)
            $minimumMs = [Math]::Max(0, ($timeline.MinSeekTime - $timeline.StartTime).TotalMilliseconds)
            $maximumMs = ($timeline.MaxSeekTime - $timeline.StartTime).TotalMilliseconds
            if ($maximumMs -le 0 -or $maximumMs -gt $durationMs) { $maximumMs = $durationMs }
            $targetMs = [Math]::Min($maximumMs, [Math]::Max($minimumMs, [double]$Matches[1]))
            $targetTicks = $timeline.StartTime.Ticks + [long][Math]::Round($targetMs * [TimeSpan]::TicksPerMillisecond)
            Wait-Operation ($session.TryChangePlaybackPositionAsync([long]$targetTicks)) ([bool]) | Out-Null
          }
        }
      }
    } catch { }
    # Run one fresh snapshot after each command so title/state changes arrive
    # immediately instead of waiting for the regular media polling interval.
    $nextPollAt = 0
  }

  if ($pollClock.ElapsedMilliseconds -ge $nextPollAt) {
  try {
    $session = Get-MediaSession
    if (-not $session) {
      $lastSignature = ''
      $cover = $null
      Send-State @{ supported = $true; active = $false }
    } else {
      $source = [string]$session.SourceAppUserModelId
      $props = Wait-Operation ($session.TryGetMediaPropertiesAsync()) $PropertiesType
      $title = [string]$props.Title
      $artist = [string]$props.Artist
      $album = [string]$props.AlbumTitle
      $signature = "$source`n$title`n$artist`n$album"
      $coverChanged = $false
      if ($signature -ne $lastSignature) {
        $lastSignature = $signature
        $coverChanged = $true
        $cover = $null
        try {
          if ($props.Thumbnail) {
            $thumb = Wait-Operation ($props.Thumbnail.OpenReadAsync()) $StreamType
            if ($thumb.Size -gt 0 -and $thumb.Size -le 4194304 -and $thumb.ContentType -match '^image/') {
              $inputStream = [System.IO.WindowsRuntimeStreamExtensions]::AsStreamForRead($thumb)
              $memory = [System.IO.MemoryStream]::new()
              $inputStream.CopyTo($memory)
              $cover = "data:$($thumb.ContentType);base64,$([Convert]::ToBase64String($memory.ToArray()))"
              $memory.Dispose(); $inputStream.Dispose(); $thumb.Dispose()
            }
          }
        } catch { $cover = $null }
      }
      $playback = $session.GetPlaybackInfo().PlaybackStatus.ToString()
      $timeline = $session.GetTimelineProperties()
      $duration = [Math]::Max(0, $timeline.EndTime.TotalSeconds - $timeline.StartTime.TotalSeconds)
      $position = [Math]::Max(0, $timeline.Position.TotalSeconds - $timeline.StartTime.TotalSeconds)
      $position = [Math]::Min($position, $duration)
      $canSeek = [bool]$session.GetPlaybackInfo().Controls.IsPlaybackPositionEnabled
      $minimumSeek = [Math]::Max(0, $timeline.MinSeekTime.TotalSeconds - $timeline.StartTime.TotalSeconds)
      $maximumSeek = [Math]::Max(0, $timeline.MaxSeekTime.TotalSeconds - $timeline.StartTime.TotalSeconds)
      if ($maximumSeek -le 0 -or $maximumSeek -gt $duration) { $maximumSeek = $duration }
      $isActive = $playback -eq 'Playing' -or ($playback -eq 'Paused' -and ($title -or $artist))
      $state = @{
        supported = $true; active = [bool]$isActive; playing = ($playback -eq 'Playing')
        title = $title; artist = $artist; album = $album; source = $source
        position = [Math]::Round($position, 2); duration = [Math]::Round($duration, 2)
        updatedAt = [long]$timeline.LastUpdatedTime.ToUnixTimeMilliseconds()
        canSeek = $canSeek; minSeek = [Math]::Round($minimumSeek, 2); maxSeek = [Math]::Round($maximumSeek, 2)
      }
      if ($coverChanged) { $state.cover = $cover }
      Send-State $state
    }
  } catch {
    Send-State @{ supported = $true; active = $false }
  }
    $nextPollAt = $pollClock.ElapsedMilliseconds + 900
  }

  # Read commands frequently without repeatedly querying Windows media state.
  # The old fixed 900 ms sleep made every button wait for the next poll.
  if ($null -ne $pendingInput) { [void]$pendingInput.Wait(20) }
  else { Start-Sleep -Milliseconds 20 }
}
