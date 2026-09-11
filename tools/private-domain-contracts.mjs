import { directDomainOwners, assertDirectDomainOwners } from "../.github/scripts/private_domain_owner_contract.mjs";

// Trusted transition runner: the legacy release retains its existing suites.
// The direct-owner release must pass real domain and controller regressions.
if (directDomainOwners) {
  await assertDirectDomainOwners();
  await import("./private-user-identity-contract.mjs");
  await import("./confirmed-user-write-contract.mjs");
  await import("./confirmed-user-lifetime-contract.mjs");
  await import("./home-domain-counts-contract.mjs");
  await import("./private-domain-events-contract.mjs");
  await import("./home-entity-identity-contract.mjs");
  if (process.argv.includes("--browser")) {
    await import("./private-owner-modal-browser-contract.mjs");
    await import("./spa-modal-regression.mjs");
  }
} else {
  console.log("Private domain transition: legacy architecture covered by existing owner contracts");
}
