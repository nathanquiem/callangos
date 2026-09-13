# Conector Callangos para MicroSIP

O conector usa os eventos nativos `cmdCallStart`, `cmdCallEnd` e `cmdCallBusy` do MicroSIP para atualizar ligações e enviar a gravação automaticamente.

## Instalação

1. Gere um token exclusivo na aba **API** do Callangos e não o compartilhe.
2. Feche completamente o MicroSIP, inclusive o ícone ao lado do relógio.
3. Clique com o botão direito em `instalar.ps1` e execute com PowerShell, ou rode:

```powershell
powershell.exe -ExecutionPolicy Bypass -File .\instalar.ps1
```

4. Cole o token quando solicitado e abra o MicroSIP novamente.

O token é protegido pelo Windows para o usuário que fez a instalação. O instalador cria um backup datado do `microsip.ini` antes de alterá-lo.
