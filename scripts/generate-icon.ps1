Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class NotchNativeIcon {
  [DllImport("user32.dll", SetLastError=true)]
  public static extern bool DestroyIcon(IntPtr icon);
}
'@

function New-RoundedPath([float]$X, [float]$Y, [float]$Width, [float]$Height, [float]$Radius) {
  $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $diameter = $Radius * 2
  $path.AddArc($X, $Y, $diameter, $diameter, 180, 90)
  $path.AddArc($X + $Width - $diameter, $Y, $diameter, $diameter, 270, 90)
  $path.AddArc($X + $Width - $diameter, $Y + $Height - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc($X, $Y + $Height - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()
  return $path
}

$bitmap = [System.Drawing.Bitmap]::new(256, 256, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.Clear([System.Drawing.Color]::FromArgb(255, 17, 17, 19))

$pill = New-RoundedPath 25 54 206 148 67
$graphics.FillPath([System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 5, 5, 6)), $pill)
$graphics.DrawPath([System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(255, 54, 52, 56), 4), $pill)
$graphics.FillEllipse([System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 23, 24, 33)), 53, 113, 30, 30)
$graphics.DrawEllipse([System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(255, 64, 64, 75), 5), 53, 113, 30, 30)
$points = [System.Drawing.PointF[]]@(
  [System.Drawing.PointF]::new(108, 134), [System.Drawing.PointF]::new(119, 134),
  [System.Drawing.PointF]::new(128, 107), [System.Drawing.PointF]::new(143, 154),
  [System.Drawing.PointF]::new(154, 120), [System.Drawing.PointF]::new(162, 134),
  [System.Drawing.PointF]::new(180, 134)
)
$gold = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(255, 222, 193, 126), 10)
$gold.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$gold.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$gold.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
$graphics.DrawLines($gold, $points)

$bitmap.Save((Join-Path $PSScriptRoot '..\assets\notch.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$handle = $bitmap.GetHicon()
$icon = [System.Drawing.Icon]::FromHandle($handle)
$stream = [System.IO.File]::Create((Join-Path $PSScriptRoot '..\assets\notch.ico'))
$icon.Save($stream)
$stream.Dispose()
[void][NotchNativeIcon]::DestroyIcon($handle)
$icon.Dispose()
$graphics.Dispose()
$bitmap.Dispose()
