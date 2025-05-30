/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

// ------------------------------------------------------------------------------
// Requirements
// ------------------------------------------------------------------------------

import rule from "../lib/rules/use-default-preference-values.mjs";
import { RuleTester } from "eslint";

const ruleTester = new RuleTester();

// ------------------------------------------------------------------------------
// Tests
// ------------------------------------------------------------------------------

function invalidCode(code) {
  return {
    code,
    errors: [{ messageId: "provideDefaultValue", type: "TryStatement" }],
  };
}

let types = ["Bool", "Char", "Float", "Int"];
let methods = types.map(type => "get" + type + "Pref");

ruleTester.run("use-default-preference-values", rule, {
  valid: [].concat(
    methods.map(m => "blah = branch." + m + "('blah', true);"),
    methods.map(m => "blah = branch." + m + "('blah');"),
    methods.map(
      m => "try { canThrow(); blah = branch." + m + "('blah'); } catch(e) {}"
    )
  ),

  invalid: [].concat(
    methods.map(m =>
      invalidCode("try { blah = branch." + m + "('blah'); } catch(e) {}")
    )
  ),
});
