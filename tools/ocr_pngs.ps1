param(
    [string]$InputRoot = "declaraciones_trimestrales\1er_trimestre_2026",
    [string]$OutputRoot = "data\extracted\ocr_texts"
)

$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() |
    Where-Object { $_.Name -eq "AsTask" -and $_.GetParameters().Count -eq 1 -and $_.IsGenericMethod })[0]

function Await-WinRt($asyncOp, $resultType) {
    $asTask = $asTaskGeneric.MakeGenericMethod($resultType)
    $task = $asTask.Invoke($null, @($asyncOp))
    $task.Wait()
    return $task.Result
}

[Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime] | Out-Null
[Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType = WindowsRuntime] | Out-Null
[Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime] | Out-Null
[Windows.Globalization.Language, Windows.Globalization, ContentType = WindowsRuntime] | Out-Null

$engine = $null
foreach ($langCode in @("es", "en")) {
    if ($null -eq $engine) {
        $lang = [Windows.Globalization.Language]::new($langCode)
        $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage($lang)
    }
}
if ($null -eq $engine) {
    $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
}
if ($null -eq $engine) {
    throw "No Windows OCR engine is available."
}

$rootPath = (Resolve-Path $InputRoot).Path
New-Item -ItemType Directory -Force -Path $OutputRoot | Out-Null

Get-ChildItem -Path $rootPath -Recurse -File -Filter *.png | ForEach-Object {
    $relative = $_.FullName.Substring($rootPath.Length).TrimStart("\", "/")
    $outFile = Join-Path $OutputRoot ($relative -replace "[\\/:*?`"<>|]", "__")

    $file = Await-WinRt ([Windows.Storage.StorageFile]::GetFileFromPathAsync($_.FullName)) ([Windows.Storage.StorageFile])
    $stream = Await-WinRt ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
    $decoder = Await-WinRt ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
    $bitmap = Await-WinRt ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
    $result = Await-WinRt ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])

    $metadata = @(
        "SOURCE=$relative"
        "ABSOLUTE_PATH=$($_.FullName)"
        "OCR_LANGUAGE=$($engine.RecognizerLanguage.LanguageTag)"
        ""
    )
    ($metadata + $result.Text) | Set-Content -Path ($outFile + ".txt") -Encoding UTF8
    Write-Output "OCR $relative"
}
