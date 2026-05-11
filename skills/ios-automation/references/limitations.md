# iOS 技能限制说明

- 该 skill 以脚本为执行核心，不再提供 MCP tool schema。
- 截图通过文件路径返回，不直接返回协议级图片内容。
- 录屏依赖本地状态文件保存 PID 和输出路径。
- 模拟器、录屏和 crash 依赖 `mobilecli`。
- 真机自动化依赖 `go-ios`、WebDriverAgent 和必要的本地端口转发。
- WebDriverAgent 默认从 `~/work/WebDriverAgent` 启动；可通过 `IOS_WDA_PATH` 覆盖。
