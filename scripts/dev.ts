import { startServer } from "./server-process";
import { startWebCms } from "./web-cms-process";
const children = [startServer(true), startWebCms()];
let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill("SIGTERM");
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
const result = await Promise.race(children.map((child) => child.exited));
stop();
await Promise.all(children.map((child) => child.exited));
process.exitCode = result;
export {};
