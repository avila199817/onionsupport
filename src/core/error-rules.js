// Error presentation: the domain decides what a person reads for an error;
// this module only walks the domain's ordered rules over the technical
// facts core/errors.js extracts (HTTP status and canonical code).
//
// presentError(error, rules, fallback):
// - facts: status = errorStatus(error, 0) (0 when no HTTP answer: network,
//   timeout, abort), code = errorCode(error) ("" when none).
// - rules: an ordered list; the first rule that matches decides. A rule
//   matches when ANY of its conditions holds (the retired domain mappers
//   chained their conditions with ||):
//     statuses: [423]             status is one of them
//     minStatus: 500              status is at least it
//     offline: true               status is 0
//     codes: ["WEAK_PASSWORD"]    code is exactly one of them
//     codeIncludes: ["LOCKED"]    code contains one of them
//     when: (facts) => boolean    a conjunction the list form cannot say
//   message: the text, or a function of the facts ({ error, status, code })
//   returning the text or the domain's presentation record (the account
//   activation returns { field, message, completed }).
// - fallback: text or function of the facts, when no rule matches.
//
// No text, status or code lives here: each rule list belongs to its domain
// and names the backend codes it interprets; the presentation contract
// checks those codes against the backend catalog.
import { errorCode, errorStatus } from "./errors.js";

function matches(rule, facts) {
  const { status, code } = facts;
  if (rule.statuses?.includes(status)) return true;
  if (rule.minStatus !== undefined && status >= rule.minStatus) return true;
  if (rule.offline === true && status === 0) return true;
  if (rule.codes?.includes(code)) return true;
  if (rule.codeIncludes?.some((part) => code.includes(part))) return true;
  return rule.when ? rule.when(facts) === true : false;
}

function resolve(value, facts) {
  return typeof value === "function" ? value(facts) : value;
}

export function presentError(error, rules, fallback) {
  const facts = { error, status: errorStatus(error, 0), code: errorCode(error) };
  for (const rule of rules) if (matches(rule, facts)) return resolve(rule.message, facts);
  return resolve(fallback, facts);
}
