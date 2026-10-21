/**
 * The basis transcoder of the installed three.js, made to run under the server's CSP (no `'unsafe-eval'`): Emscripten's
 * embind builds its invokers with `new Function` (craftInvokerFunction, the emval method caller), which the CSP blocks in
 * the KTX2 loader's workers, and the arena then never finished loading. Both are rewritten as closures, the code
 * Emscripten emits with `-sDYNAMIC_EXECUTION=0`; any other `new Function` left fails the build, and `checkTranscoder`
 * transcodes a file in a context where code generation from strings is off, as in the browser.
 */
import { createContext, runInContext } from "node:vm";

/** Each generated invoker, as three.js ships it, and its closure. */
const PATCHES: [string, string][] = [
  [
    "let[args,invokerFnBody]=createJsInvoker(argTypes,isClassMethodFunc,returns,isAsync);args.push(invokerFnBody);var invokerFn=newFunc(Function,args)(...closureArgs);",
    // biome-ignore format: generated code, kept on one line like the rest of the file
    "var invokerFn=function(...a){if(a.length!==argCount-2){throwBindingError(\"function \"+humanName+\" called with \"+a.length+\" arguments, expected \"+(argCount-2))}var destructors=needsDestructorStack?[]:null;var wired=[];if(isClassMethodFunc){wired.push(argTypes[1][\"toWireType\"](destructors,this))}for(var i=0;i<argCount-2;++i){wired.push(argTypes[i+2][\"toWireType\"](destructors,a[i]))}var rv=cppInvokerFunc(cppTargetFunc,...wired);if(needsDestructorStack){runDestructors(destructors)}else{var first=isClassMethodFunc?1:2;for(var i=first;i<argTypes.length;++i){if(argTypes[i].destructorFunction!==null){argTypes[i].destructorFunction(wired[i-first])}}}if(returns){return argTypes[0][\"fromWireType\"](rv)}};",
  ],
  [
    "params.push(functionBody);var invokerFunction=newFunc(Function,params)(...args);",
    // biome-ignore format: generated code
    "var invokerFunction=function(obj,func,destructorsRef,argsPtr){var argv=[];var offset=0;for(var i=0;i<argCount;++i){argv.push(types[i].readValueFromPointer(argsPtr+offset));offset+=types[i][\"argPackAdvance\"]}var rv=kind===1?reflectConstruct(func,argv):kind===0?func.call(obj,...argv):func.call(...argv);if(!retType.isVoid){return emval_returnValue(retType,destructorsRef,rv)}};",
  ],
];

export function patchTranscoder(js: string): string {
  let out = js;
  for (const [from, to] of PATCHES) {
    if (out.split(from).length !== 2)
      throw new Error("basis transcoder: an invoker changed in this three.js version, update tools/basis-transcoder.ts");
    out = out.replace(from, () => to);
  }
  if (/newFunc\(Function|new Function|\beval\(/.test(out))
    throw new Error("basis transcoder: code built from strings is left, update tools/basis-transcoder.ts");
  return out;
}

/**
 * Transcodes the first image of `ktx2` to RGBA with the transcoder `js` and `wasm`, where `eval` and `new Function` throw
 * (as under the CSP); throws if it fails. Resolves with the image's size.
 */
export async function checkTranscoder(js: string, wasm: Uint8Array, ktx2: Uint8Array): Promise<{ w: number; h: number }> {
  const ctx = createContext({ console }, { codeGeneration: { strings: false, wasm: true } });
  // biome-ignore lint/suspicious/noExplicitAny: the transcoder's module object
  const BASIS = runInContext(`${js}\n;BASIS`, ctx) as (m: any) => unknown;
  // biome-ignore lint/suspicious/noExplicitAny: idem
  const mod: any = await new Promise((resolve, reject) => {
    const m = { wasmBinary: wasm, onRuntimeInitialized: () => resolve(m), onAbort: reject };
    Promise.resolve(BASIS(m)).catch(reject);
  });
  mod.initializeBasis();
  const file = new mod.KTX2File(ktx2);
  try {
    if (!file.isValid() || !file.startTranscoding()) throw new Error("basis transcoder: the KTX2 file is refused");
    const RGBA32 = 13;
    const dst = new Uint8Array(file.getImageTranscodedSizeInBytes(0, 0, 0, RGBA32));
    if (!file.transcodeImage(dst, 0, 0, 0, RGBA32, 0, -1, -1)) throw new Error("basis transcoder: transcoding failed");
    return { w: file.getWidth(), h: file.getHeight() };
  } finally {
    file.close();
    file.delete();
  }
}
