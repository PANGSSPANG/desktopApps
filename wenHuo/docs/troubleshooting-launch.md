# 启动问题排查手册

> 适用：双击 `wenhuo.exe` 没反应、闪一下就退、提示"无法创建数据目录"。
> 目标：**一次跑完对照实验**，把"环境问题"和"代码问题"分开。

## 一条命令

```powershell
pnpm diagnose:launch              # 诊断 release/win-unpacked
pnpm diagnose:launch --dump       # 顺带开启崩溃转储（需管理员）
```

脚本会打印并保存 `diagnose-report.md`，包含三块内容：

1. **环境事实**：exe 路径与大小、当前目录、平台、`WENHUO_USER_DATA` 是否设置
2. **数据目录可写性**：`%APPDATA%`、`%LOCALAPPDATA%`、exe 同目录 `data/`、工作目录 `.appdata/` 逐个真实建目录 + 写文件探测
3. **四组启动对照**（每组默认等 8 秒，可用 `--seconds` 调）

| 场景 | 变量 |
| --- | --- |
| ① 原样启动 | 什么都不加 |
| ② 加 `--no-sandbox` | 只关沙箱 |
| ③ `--no-sandbox` + `WENHUO_USER_DATA` | 同时指定可写数据目录 |
| ④ 整个目录拷到临时目录后原样启动 | 隔离"exe 所在路径" |

## 怎么读结果

| 结果 | 结论 | 处理 |
| --- | --- | --- |
| ① 失败、② 成功 | 环境沙箱问题（Chromium 沙箱初始化失败） | 用 `start-wenhuo-no-sandbox.cmd` 或 `文火（兼容模式）.lnk` |
| ② 失败、③ 成功 | 默认数据目录不可写 | 设 `WENHUO_USER_DATA`，或让应用自动回退（已实现） |
| ① 失败、④ 成功 | **exe 所在目录**有限制（AI 工作区就是这种） | 把程序拷到工作区之外运行 |
| ④ 也失败 | 应用自身问题 | 看下面的 stderr 与事件日志 |

退出码含义：

- `0x80000003`：Chromium 的 `CHECK()` 失败（`STATUS_BREAKPOINT`），通常发生在我们的 JS 执行之前
- `0xffff7003`：启动阶段更早的错误，常见伴随 `crashpad ... not connected`
- 空退出码 / 无日志：进程被系统或安全软件直接终止

## 补充取证

```powershell
# 最近的应用崩溃记录（含故障模块与异常码）
Get-WinEvent -FilterHashtable @{LogName='Application'; Id=1000; StartTime=(Get-Date).AddHours(-1)} |
  Where-Object { $_.Message -match 'wenhuo' } | Select-Object TimeCreated, Message

# 是否被代码完整性策略拦截
Get-WinEvent -LogName 'Microsoft-Windows-CodeIntegrity/Operational' -MaxEvents 20 -ErrorAction SilentlyContinue

# 智能应用控制 / 内核隔离
Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\CI\Policy' -Name VerifiedAndReputablePolicyState
Get-CimInstance Win32_DeviceGuard -Namespace root\Microsoft\Windows\DeviceGuard | Select-Object SecurityServicesRunning
```

## 抓崩溃转储

```powershell
pnpm diagnose:launch --dump
# 复现崩溃后，dump 落在 <仓库>/.dumps
```

用 WinDbg 打开 `.dmp`，加载 Electron 对应版本的 PDB（`electron-v43.3.0-win32-x64.pdb`），执行 `!analyze -v` 即可看到触发 `CHECK` 的具体位置——这是唯一能确认"到底哪个检查失败"的路径。

## 已知案例

| 现象 | 根因 | 解决 |
| --- | --- | --- |
| 在 AI 工作区目录里双击无反应，拷到 C 盘/D 盘其它位置正常 | 该目录下启动的进程被加了限制，Chromium 早期 `CHECK` 失败（`0x80000003`） | 拷出工作区运行；或用带 `--no-sandbox` 的启动器 |
| 提示"无法创建数据目录 …" | `%APPDATA%` 或指定目录不可写（EPERM） | 已实现自动回退：`WENHUO_USER_DATA` → `%APPDATA%` → `~/.wenhuo` → exe 同目录 `data/` → 当前目录 `.appdata/` |
| `dist:win` 报 `process failed 2` | NSIS 生成卸载器时失败，常见于 `%TEMP%` 含中文或安全软件拦截 | 把 `TEMP`/`TMP` 指到纯英文路径重试；或改用 `dist:win:portable` / `dist:win:zip` |
