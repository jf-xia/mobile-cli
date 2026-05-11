# Android 技能限制说明

- 该 skill 以脚本为执行核心，不再提供 MCP tool schema。
- 截图通过文件路径返回，不直接返回协议级图片内容。
- 录屏依赖本地状态文件保存 PID 和输出路径。
- 远程设备、录屏和 crash 依赖 `mobilecli`。
- 真机与模拟器发现依赖 `adb`。
