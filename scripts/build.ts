import { rm } from "node:fs/promises";
import { appConfig } from "../app.config";
const webCmsBuild = Bun.spawn(
  ["bun", "run", "--cwd", "apps/web-cms", "build"],
  { stdout: "inherit", stderr: "inherit" },
);
if ((await webCmsBuild.exited) !== 0) process.exit(1);
const result = await Bun.build({
  entrypoints: [appConfig.serverEntry],
  outdir: "dist/server",
  naming: "main.[ext]",
  target: "bun",
  minify: true,
  sourcemap: "external",
});
if (!result.success) {
  console.error(result.logs);
  process.exit(1);
}
// 只转换公开模板，不复制本机 .env、密码或 public 中的文件。
const example = (await Bun.file(".env.example").text())
  .replace(/^APP_ENV=.*$/m, "APP_ENV=production")
  .replace(/^PUBLIC_ORIGIN=.*$/m, "PUBLIC_ORIGIN=http://127.0.0.1:9811")
  .replace(/^# WEB_CMS_DIST=.*$/m, "WEB_CMS_DIST=web-cms")
  .replace(
    "相对于项目根目录；默认 dist/web-cms，通常无需修改。",
    "相对于启动目录；部署包中使用 web-cms。",
  )
  .replace(
    "相对于项目根目录，也支持绝对路径",
    "相对于启动目录，也支持绝对路径",
  );
await Bun.write("dist/.env.example", example);
// 移除旧构建生成的依赖清单；保留部署配置、公开文件和运行数据。
await rm("dist/package.json", { force: true });
await rm("dist/bun.lock", { force: true });
console.log(
  "构建完成。部署时进入 dist，配置 .env，然后执行 bun server/main.js；无需安装运行依赖。",
);
