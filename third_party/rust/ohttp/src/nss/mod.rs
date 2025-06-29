// Licensed under the Apache License, Version 2.0 <LICENSE-APACHE or
// http://www.apache.org/licenses/LICENSE-2.0> or the MIT license
// <LICENSE-MIT or http://opensource.org/licenses/MIT>, at your
// option. This file may not be copied, modified, or distributed
// except according to those terms.

mod err;
#[macro_use]
mod p11;
pub mod aead;
pub mod hkdf;
pub mod hpke;

pub use self::p11::{random, PrivateKey, PublicKey};
use err::secstatus_to_res;
pub use err::Error;
use std::{ptr::null, sync::OnceLock};

#[allow(clippy::pedantic, non_upper_case_globals, clippy::upper_case_acronyms)]
mod nss_init {
    include!(concat!(env!("OUT_DIR"), "/nss_init.rs"));
}

use nss_init::SECStatus;
#[allow(non_upper_case_globals)]
const SECSuccess: SECStatus = nss_init::_SECStatus_SECSuccess;
#[cfg(test)]
#[allow(non_upper_case_globals)]
const SECFailure: SECStatus = nss_init::_SECStatus_SECFailure;

#[derive(PartialEq, Eq)]
enum NssLoaded {
    External,
    NoDb,
}

impl Drop for NssLoaded {
    fn drop(&mut self) {
        if matches!(self, Self::NoDb) {
            unsafe {
                secstatus_to_res(nss_init::NSS_Shutdown()).expect("NSS Shutdown failed");
            }
        }
    }
}

static INITIALIZED: OnceLock<NssLoaded> = OnceLock::new();

fn already_initialized() -> bool {
    unsafe { nss_init::NSS_IsInitialized() != 0 }
}

/// Initialize NSS.  This only executes the initialization routines once.
pub fn init() {
    INITIALIZED.get_or_init(|| {
        if already_initialized() {
            NssLoaded::External
        } else {
            secstatus_to_res(unsafe { nss_init::NSS_NoDB_Init(null()) })
                .expect("NSS_NoDB_Init failed");
            NssLoaded::NoDb
        }
    });
}
