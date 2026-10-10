// 路径单源：插件仓（代码/依赖/站点）与数据目录（纯本地私有，不进任何 git）分离
//   PLUGIN_ROOT  本插件安装根（脚本、站点、node_modules 所在）
//   KB_ROOT      数据目录：用例/画像/回执/登录态；默认 ~/.testcase-kb，KB_ROOT 环境变量可覆盖
// 想共享数据时把 KB_ROOT 指向一个 git 仓即可——两种模式兼容。
import { join, resolve } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

export const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const KB_ROOT = resolve(process.env.KB_ROOT || join(homedir(), '.testcase-kb'))
