/* eslint-disable strict */
function run_test() {
  Services.prefs.setBoolPref("security.allow_eval_with_system_principal", true);
  registerCleanupFunction(() => {
    Services.prefs.clearUserPref("security.allow_eval_with_system_principal");
  });
  const { addDebuggerToGlobal } = ChromeUtils.importESModule(
    "resource://gre/modules/jsdebugger.sys.mjs"
  );
  addDebuggerToGlobal(globalThis);

  const dbg = makeDebugger({
    shouldAddNewGlobalAsDebuggee() {
      return true;
    },
  });
  const g = createTestGlobal("test1");
  dbg.addDebuggee(g);
  dbg.onDebuggerStatement = function (frame) {
    const args = frame.arguments;
    try {
      args[0];
      Assert.ok(true);
    } catch (ex) {
      Assert.ok(false);
    }
  };

  g.eval("function stopMe(arg) {debugger;}");

  const g2 = createTestGlobal("test2");
  g2.g = g;
  // Not using the "stringify a function" trick because that runs afoul of the
  // Cu.importGlobalProperties lint and we don't need it here anyway.
  g2.eval(`(function createBadEvent() {
    let parser = new DOMParser();
    let doc = parser.parseFromString("<foo></foo>", "text/xml");
    g.stopMe(doc.createEvent("MouseEvent"));
  } )()`);

  dbg.disable();
}
