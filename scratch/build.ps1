$src     = 'D:\Xampp\htdocs\extensionX'
$out     = 'D:\Xampp\htdocs\extensionX\x-media-downloader-v3.5.5.zip'
$include = @('_locales','background','content','icons','lib','offscreen','options','popup','manifest.json','rules.json')

if (Test-Path $out) { Remove-Item $out -Force }

Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::Open($out, 'Create')

foreach ($item in $include) {
    $fullPath = Join-Path $src $item
    if (Test-Path $fullPath -PathType Leaf) {
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $fullPath, $item) | Out-Null
    } elseif (Test-Path $fullPath -PathType Container) {
        Get-ChildItem -Path $fullPath -Recurse -File | ForEach-Object {
            $relative = $_.FullName.Substring($src.Length + 1).Replace('\', '/')
            [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $_.FullName, $relative) | Out-Null
        }
    }
}

$zip.Dispose()
$size = (Get-Item $out).Length
Write-Host ('Built: {0} ({1:N0} bytes)' -f $out, $size)
