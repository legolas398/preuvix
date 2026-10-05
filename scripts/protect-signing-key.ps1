param([Parameter(Mandatory=$true)][string]$KeyPath)
$ErrorActionPreference = 'Stop'
$resolvedKey = (Resolve-Path -LiteralPath $KeyPath).Path
if ((Get-Item -LiteralPath $resolvedKey).PSIsContainer) { throw 'Expected a private key file.' }
$keyAcl = New-Object System.Security.AccessControl.FileSecurity
$keyAcl.SetAccessRuleProtection($true, $false)
$keyOwner = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
foreach ($keySid in @($keyOwner.Value, 'S-1-5-18', 'S-1-5-32-544')) {
  $keyRule = New-Object System.Security.AccessControl.FileSystemAccessRule([System.Security.Principal.SecurityIdentifier]::new($keySid), 'FullControl', 'Allow')
  $keyAcl.AddAccessRule($keyRule)
}
Set-Acl -LiteralPath $resolvedKey -AclObject $keyAcl
