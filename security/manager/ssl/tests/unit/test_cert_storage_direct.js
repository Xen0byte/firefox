/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

// This file consists of unit tests for cert_storage (whereas test_cert_storage.js is more of an
// integration test).

do_get_profile();

this.certStorage = Cc["@mozilla.org/security/certstorage;1"].getService(
  Ci.nsICertStorage
);

async function addCerts(certInfos) {
  let result = await new Promise(resolve => {
    certStorage.addCerts(certInfos, resolve);
  });
  Assert.equal(result, Cr.NS_OK, "addCerts should succeed");
}

async function removeCertsByHashes(hashesBase64) {
  let result = await new Promise(resolve => {
    certStorage.removeCertsByHashes(hashesBase64, resolve);
  });
  Assert.equal(result, Cr.NS_OK, "removeCertsByHashes should succeed");
}

function getLongString(uniquePart, length) {
  return String(uniquePart).padStart(length, "0");
}

class CertInfo {
  constructor(cert, subject) {
    this.cert = btoa(cert);
    this.subject = btoa(subject);
    this.trust = Ci.nsICertStorage.TRUST_INHERIT;
  }
}
CertInfo.prototype.QueryInterface = ChromeUtils.generateQI(["nsICertInfo"]);

add_task(async function test_common_subject() {
  let someCert1 = new CertInfo(
    "some certificate bytes 1",
    "some common subject"
  );
  let someCert2 = new CertInfo(
    "some certificate bytes 2",
    "some common subject"
  );
  let someCert3 = new CertInfo(
    "some certificate bytes 3",
    "some common subject"
  );
  await addCerts([someCert1, someCert2, someCert3]);
  let storedCerts = certStorage.findCertsBySubject(
    stringToArray("some common subject")
  );
  let storedCertsAsStrings = storedCerts.map(arrayToString);
  let expectedCerts = [
    "some certificate bytes 1",
    "some certificate bytes 2",
    "some certificate bytes 3",
  ];
  Assert.deepEqual(
    storedCertsAsStrings.sort(),
    expectedCerts.sort(),
    "should find expected certs"
  );

  await addCerts([
    new CertInfo("some other certificate bytes", "some other subject"),
  ]);
  storedCerts = certStorage.findCertsBySubject(
    stringToArray("some common subject")
  );
  storedCertsAsStrings = storedCerts.map(arrayToString);
  Assert.deepEqual(
    storedCertsAsStrings.sort(),
    expectedCerts.sort(),
    "should still find expected certs"
  );

  let storedOtherCerts = certStorage.findCertsBySubject(
    stringToArray("some other subject")
  );
  let storedOtherCertsAsStrings = storedOtherCerts.map(arrayToString);
  let expectedOtherCerts = ["some other certificate bytes"];
  Assert.deepEqual(
    storedOtherCertsAsStrings,
    expectedOtherCerts,
    "should have other certificate"
  );
});

add_task(async function test_many_entries() {
  const NUM_CERTS = 500;
  const CERT_LENGTH = 3000;
  const SUBJECT_LENGTH = 40;
  let certs = [];
  for (let i = 0; i < NUM_CERTS; i++) {
    certs.push(
      new CertInfo(
        getLongString(i, CERT_LENGTH),
        getLongString(i, SUBJECT_LENGTH)
      )
    );
  }
  await addCerts(certs);
  for (let i = 0; i < NUM_CERTS; i++) {
    let subject = stringToArray(getLongString(i, SUBJECT_LENGTH));
    let storedCerts = certStorage.findCertsBySubject(subject);
    Assert.equal(
      storedCerts.length,
      1,
      "should have 1 certificate (lots of data test)"
    );
    let storedCertAsString = arrayToString(storedCerts[0]);
    Assert.equal(
      storedCertAsString,
      getLongString(i, CERT_LENGTH),
      "certificate should be as expected (lots of data test)"
    );
  }
});

add_task(async function test_removal() {
  // As long as cert_storage is given valid base64, attempting to delete some nonexistent
  // certificate will "succeed" (it'll do nothing).
  await removeCertsByHashes([btoa("thishashisthewrongsize")]);

  let removalCert1 = new CertInfo(
    "removal certificate bytes 1",
    "common subject to remove"
  );
  let removalCert2 = new CertInfo(
    "removal certificate bytes 2",
    "common subject to remove"
  );
  let removalCert3 = new CertInfo(
    "removal certificate bytes 3",
    "common subject to remove"
  );
  await addCerts([removalCert1, removalCert2, removalCert3]);

  let storedCerts = certStorage.findCertsBySubject(
    stringToArray("common subject to remove")
  );
  let storedCertsAsStrings = storedCerts.map(arrayToString);
  let expectedCerts = [
    "removal certificate bytes 1",
    "removal certificate bytes 2",
    "removal certificate bytes 3",
  ];
  Assert.deepEqual(
    storedCertsAsStrings.sort(),
    expectedCerts.sort(),
    "should find expected certs before removing them"
  );

  // echo -n "removal certificate bytes 2" | sha256sum | xxd -r -p | base64
  await removeCertsByHashes(["2nUPHwl5TVr1mAD1FU9FivLTlTb0BAdnVUhsYgBccN4="]);
  storedCerts = certStorage.findCertsBySubject(
    stringToArray("common subject to remove")
  );
  storedCertsAsStrings = storedCerts.map(arrayToString);
  expectedCerts = [
    "removal certificate bytes 1",
    "removal certificate bytes 3",
  ];
  Assert.deepEqual(
    storedCertsAsStrings.sort(),
    expectedCerts.sort(),
    "should only have first and third certificates now"
  );

  // echo -n "removal certificate bytes 1" | sha256sum | xxd -r -p | base64
  await removeCertsByHashes(["8zoRqHYrklr7Zx6UWpzrPuL+ol8KL1Ml6XHBQmXiaTY="]);
  storedCerts = certStorage.findCertsBySubject(
    stringToArray("common subject to remove")
  );
  storedCertsAsStrings = storedCerts.map(arrayToString);
  expectedCerts = ["removal certificate bytes 3"];
  Assert.deepEqual(
    storedCertsAsStrings.sort(),
    expectedCerts.sort(),
    "should only have third certificate now"
  );

  // echo -n "removal certificate bytes 3" | sha256sum | xxd -r -p | base64
  await removeCertsByHashes(["vZn7GwDSabB/AVo0T+N26nUsfSXIIx4NgQtSi7/0p/w="]);
  storedCerts = certStorage.findCertsBySubject(
    stringToArray("common subject to remove")
  );
  Assert.equal(storedCerts.length, 0, "shouldn't have any certificates now");

  // echo -n "removal certificate bytes 3" | sha256sum | xxd -r -p | base64
  // Again, removing a nonexistent certificate should "succeed".
  await removeCertsByHashes(["vZn7GwDSabB/AVo0T+N26nUsfSXIIx4NgQtSi7/0p/w="]);
});

function base64ToArray(base64String) {
  let binaryString = atob(base64String);
  return stringToArray(binaryString);
}

add_task(async function test_lookup_by_hash_succeed() {
  let someCert1 = new CertInfo("some certificate bytes 1", "common subject 1");
  let someCert2 = new CertInfo(
    "some certificate bytes 2",
    "some common subject 2"
  );
  let someCert3 = new CertInfo(
    "some certificate bytes 3",
    "some common subject 3"
  );
  await addCerts([someCert1, someCert2, someCert3]);
  // echo -n "some certificate bytes 2" | sha256sum | xxd -r -p | base64
  let foundCert = certStorage.findCertByHash(
    base64ToArray("j1vIqpiU0HMmx3zPNujlfGs/pY1vFBJCKpJEeVseeW0=")
  );

  Assert.deepEqual(
    arrayToString(foundCert),
    atob(someCert2.cert),
    "should find expected cert"
  );
});

add_task(async function test_lookup_by_hash_fail() {
  let someCert1 = new CertInfo("some certificate bytes 1", "common subject 1");
  let someCert2 = new CertInfo(
    "some certificate bytes 2",
    "some common subject 2"
  );
  let someCert3 = new CertInfo(
    "some certificate bytes 3",
    "some common subject 3"
  );
  await addCerts([someCert1, someCert2, someCert3]);
  Assert.throws(
    () =>
      certStorage.findCertByHash(
        base64ToArray("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa=")
      ),
    /NS_ERROR_FAILURE/
  );
});

add_task(async function test_lookup_by_hashes_succeed() {
  let someCert1 = new CertInfo("some certificate bytes 1", "common subject 1");
  let someCert2 = new CertInfo(
    "some certificate bytes 2",
    "some common subject 2"
  );
  let someCert3 = new CertInfo(
    "some certificate bytes 3",
    "some common subject 3"
  );
  await addCerts([someCert1, someCert2, someCert3]);
  // echo -n "some certificate bytes 2" | sha256sum | xxd -r -p | base64
  // echo -n "some certificate bytes 1" | sha256sum | xxd -r -p | base64
  let foundCerts = certStorage.hasAllCertsByHash([
    base64ToArray("j1vIqpiU0HMmx3zPNujlfGs/pY1vFBJCKpJEeVseeW0="),
    base64ToArray("c0iy21PfFlGAqqLnQYeSYYUoaF/JEc41lICBdZ7VFtk="),
  ]);
  Assert.equal(foundCerts, true);
});

add_task(async function test_lookup_by_hashes_fail() {
  let someCert1 = new CertInfo("some certificate bytes 1", "common subject 1");
  let someCert2 = new CertInfo(
    "some certificate bytes 2",
    "some common subject 2"
  );
  let someCert3 = new CertInfo(
    "some certificate bytes 3",
    "some common subject 3"
  );
  await addCerts([someCert1, someCert2, someCert3]);
  // echo -n "some certificate bytes 2" | sha256sum | xxd -r -p | base64
  // echo -n "some certificate bytes 1" | sha256sum | xxd -r -p | base64
  let foundCerts = certStorage.hasAllCertsByHash([
    base64ToArray("j1vIqpiU0HMmx3zPNujlfGs/pY1vFBJCKpJEeVseeW0="),
    base64ToArray("c0iy21PfFlGAqqLnQYeSYYUoaF/JEc41lICBdZ7VFtk="),
    base64ToArray("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa="),
  ]);
  Assert.equal(foundCerts, false);
});

add_task(async function test_batched_removal() {
  let removalCert1 = new CertInfo(
    "batch removal certificate bytes 1",
    "batch subject to remove"
  );
  let removalCert2 = new CertInfo(
    "batch removal certificate bytes 2",
    "batch subject to remove"
  );
  let removalCert3 = new CertInfo(
    "batch removal certificate bytes 3",
    "batch subject to remove"
  );
  await addCerts([removalCert1, removalCert2, removalCert3]);
  let storedCerts = certStorage.findCertsBySubject(
    stringToArray("batch subject to remove")
  );
  let storedCertsAsStrings = storedCerts.map(arrayToString);
  let expectedCerts = [
    "batch removal certificate bytes 1",
    "batch removal certificate bytes 2",
    "batch removal certificate bytes 3",
  ];
  Assert.deepEqual(
    storedCertsAsStrings.sort(),
    expectedCerts.sort(),
    "should find expected certs before removing them"
  );
  // echo -n "batch removal certificate bytes 1" | sha256sum | xxd -r -p | base64
  // echo -n "batch removal certificate bytes 2" | sha256sum | xxd -r -p | base64
  // echo -n "batch removal certificate bytes 3" | sha256sum | xxd -r -p | base64
  await removeCertsByHashes([
    "EOEEUTuanHZX9NFVCoMKVT22puIJC6g+ZuNPpJgvaa8=",
    "Xz6h/Kvn35cCLJEZXkjPqk1GG36b56sreLyAXpO+0zg=",
    "Jr7XdiTT8ZONUL+ogNNMW2oxKxanvYOLQPKBPgH/has=",
  ]);
  storedCerts = certStorage.findCertsBySubject(
    stringToArray("batch subject to remove")
  );
  Assert.equal(storedCerts.length, 0, "shouldn't have any certificates now");
});
