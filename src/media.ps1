$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName System.Runtime.WindowsRuntime

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
  $manager = Wait-Operation ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
  Send-State @{ supported = $true; active = $false }
} catch {
  Send-State @{ supported = $false; active = $false; error = $_.Exception.Message }
  exit 0
}

$pendingInput = $null
$lastSignature = ''
$cover = $null
while ($true) {
  if ($null -eq $pendingInput) { $pendingInput = [Console]::In.ReadLineAsync() }
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
      }
    } catch { }
  }

  try {
    $session = Get-MediaSession
    if (-not $session) {
      $lastSignature = ''
      $cover = $null
      Send-State @{ supported = $true; active = $false }
    } else {
      $source = [string]$session.SourceAppUserModelId
      $props = Wait-Operation ($session.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
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
            $thumb = Wait-Operation ($props.Thumbnail.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
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
      $position = [Math]::Max(0, $timeline.Position.TotalSeconds)
      $duration = [Math]::Max(0, $timeline.EndTime.TotalSeconds - $timeline.StartTime.TotalSeconds)
      $isActive = $playback -eq 'Playing' -or ($playback -eq 'Paused' -and ($title -or $artist))
      $state = @{
        supported = $true; active = [bool]$isActive; playing = ($playback -eq 'Playing')
        title = $title; artist = $artist; album = $album; source = $source
        position = [Math]::Round($position, 1); duration = [Math]::Round($duration, 1)
      }
      if ($coverChanged) { $state.cover = $cover }
      Send-State $state
    }
  } catch {
    Send-State @{ supported = $true; active = $false }
  }
  Start-Sleep -Milliseconds 900
}
