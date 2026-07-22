/**
 * Module 01 entry point. Notice: no React here at all. index.html loads this
 * file; we grab the #root div and hand it to raw Three.js.
 */
import { startScene } from "./vanilla";

startScene(document.getElementById("root")!);
