param(
    [Parameter(Mandatory=$true)]
    [string]$docxPath,
    [Parameter(Mandatory=$true)]
    [string]$pdfPath
)

try {
    $word = New-Object -ComObject Word.Application
    $word.Visible = $false
    $word.DisplayAlerts = "wdAlertsNone"

    $doc = $word.Documents.Open($docxPath)
    
    # wdFormatPDF = 17
    $doc.SaveAs([ref]$pdfPath, [ref]17)
    
    $doc.Close()
    $word.Quit()
    
    # Clean up COM object
    [System.Runtime.Interopservices.Marshal]::ReleaseComObject($word) | Out-Null
    
    Write-Host "Conversion successful"
} catch {
    Write-Error "Error converting document: $_"
    if ($word) {
        $word.Quit()
        [System.Runtime.Interopservices.Marshal]::ReleaseComObject($word) | Out-Null
    }
    exit 1
}
