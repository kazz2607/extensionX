$version = "4.0.0"
$zipName = "x-media-downloader-v$version.zip"
$include = @("_locales","background","content","icons","lib","offscreen","options","popup","manifest.json","rules.json")
if (Test-Path $zipName) { Remove-Item $zipName }
Compress-Archive -Path $include -DestinationPath $zipName -CompressionLevel Optimal
$sizeKB = [math]::Round((Get-Item $zipName).Length / 1KB, 1)
Write-Host "Built: $zipName ($sizeKB KB)"
