//! Fee-policy DRIFT GATE — the Rust half.
//!
//! Four fee decisions exist twice on purpose and cannot be de-duplicated:
//! iOS/Android run Hermes, which has no WebAssembly, so native executes the
//! TypeScript copy while web executes this core. Deleting either copy is not an
//! option; letting them disagree is not either, because the two halves quote the
//! SAME user the SAME transaction.
//!
//!   1. the gas-tier multiplier table (`safe-transaction.ts:244-249`)
//!   2. the in-band reimbursement formula — markup 3, the 8-dp USD scale and its
//!      rounding directions, the 0.00001-native floor, the $0.01 stable floor
//!      (`safe-transaction.ts:342-390`)
//!   3. the Tempo stablecoin reimbursement (`tempo.ts:143-160`)
//!   4. the fee-row `balance < fee` selectability gate (`FeeTokenSelector.tsx`)
//!
//! `tests/vectors-fee-policy/fee-policy.json` is the shared oracle; the
//! TypeScript half replays the very same file in
//! `src/__tests__/services/fee-policy-parity.test.ts`. Change one side without
//! the other and exactly one of the two suites goes red.
//!
//! It deliberately does NOT live in `tests/vectors/`: that directory is the
//! pinned conformance corpus whose runner asserts an exact suite set.

use serde::Deserialize;
use serde_json::Value;
use std::fs;
use std::path::PathBuf;

use vela_core::app::fee_policy::{
    calculate_in_band_fee_amount, fee_row_insufficient, tempo_reimbursement, tier_multiplier,
    AssetPricing, FeeTier,
};

#[derive(Deserialize)]
struct SuiteFile {
    suite: String,
    cases: Vec<Case>,
}

#[derive(Deserialize)]
struct Case {
    name: String,
    #[serde(rename = "fn")]
    func: String,
    input: Value,
    expect: Value,
}

fn corpus_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/vectors-fee-policy/fee-policy.json")
}

/// Decimal-string field → u128. Numbers are strings in this corpus so a value
/// past 2^53 can never be silently mangled by a JSON reader.
fn u128_of(input: &Value, key: &str) -> u128 {
    let raw = input
        .get(key)
        .and_then(Value::as_str)
        .unwrap_or_else(|| panic!("missing decimal-string input `{key}`"));
    raw.parse()
        .unwrap_or_else(|e| panic!("input `{key}` = {raw:?} is not a u128: {e}"))
}

/// A nullable decimal-string field: `null` means "cannot be priced".
fn opt_u128_of(input: &Value, key: &str) -> Option<u128> {
    match input.get(key) {
        None | Some(Value::Null) => None,
        Some(Value::String(s)) => Some(
            s.parse()
                .unwrap_or_else(|e| panic!("input `{key}` = {s:?} is not a u128: {e}")),
        ),
        Some(other) => panic!("input `{key}` must be a decimal string or null, got {other}"),
    }
}

fn asset_of(input: &Value, key: &str) -> AssetPricing {
    let asset = input
        .get(key)
        .unwrap_or_else(|| panic!("missing asset input `{key}`"));
    AssetPricing {
        is_native: asset["is_native"].as_bool().expect("is_native"),
        decimals: u32::try_from(asset["decimals"].as_u64().expect("decimals")).expect("decimals"),
        usd_price: asset["usd_price"].as_str().map(str::to_owned),
    }
}

fn tier_of(input: &Value) -> FeeTier {
    match input["tier"].as_str().expect("tier") {
        "slow" => FeeTier::Slow,
        "standard" => FeeTier::Standard,
        "rapid" => FeeTier::Rapid,
        "fast" => FeeTier::Fast,
        other => panic!("unknown tier `{other}`"),
    }
}

/// `Some(u128)` → its decimal string; `None` → JSON null, so a refusal and a
/// zero amount can never be confused for one another.
fn amount_json(value: Option<u128>) -> Value {
    match value {
        Some(v) => Value::String(v.to_string()),
        None => Value::Null,
    }
}

fn run(case: &Case) -> Result<(), String> {
    let input = &case.input;
    let actual = match case.func.as_str() {
        "tier_multiplier" => {
            let (num, den) = tier_multiplier(tier_of(input));
            serde_json::json!({ "num": num.to_string(), "den": den.to_string() })
        }
        "in_band_fee" => {
            let amount = calculate_in_band_fee_amount(
                u128_of(input, "total_gas"),
                u128_of(input, "gas_price"),
                &asset_of(input, "fee_asset"),
                &asset_of(input, "native_asset"),
            );
            serde_json::json!({ "amount": amount_json(amount) })
        }
        "tempo_reimbursement" => {
            let decimals =
                u32::try_from(input["decimals"].as_u64().expect("decimals")).expect("decimals");
            let amount = tempo_reimbursement(
                u128_of(input, "expected_gas"),
                u128_of(input, "gas_price_atto"),
                decimals,
            );
            serde_json::json!({ "amount": amount.to_string() })
        }
        "fee_row_insufficient" => {
            let value = fee_row_insufficient(u128_of(input, "balance"), opt_u128_of(input, "amount"));
            serde_json::json!({ "value": value })
        }
        other => return Err(format!("unknown fn `{other}`")),
    };
    if actual == case.expect {
        Ok(())
    } else {
        Err(format!("expected {} got {}", case.expect, actual))
    }
}

#[test]
fn fee_policy_parity_corpus() {
    let path = corpus_path();
    let raw = fs::read_to_string(&path)
        .unwrap_or_else(|e| panic!("no fee-policy parity corpus at {} ({e})", path.display()));
    let suite: SuiteFile =
        serde_json::from_str(&raw).unwrap_or_else(|e| panic!("{}: bad schema: {e}", path.display()));
    assert_eq!(suite.suite, "fee-policy");

    // A corpus that silently shrank (bad merge, partial checkout) would make
    // this gate report green over nothing — the failure mode the conformance
    // runner's suite pin exists to prevent, one level down.
    let covered: Vec<&str> = ["tier_multiplier", "in_band_fee", "tempo_reimbursement", "fee_row_insufficient"]
        .into_iter()
        .filter(|f| suite.cases.iter().any(|c| c.func == *f))
        .collect();
    assert_eq!(
        covered,
        ["tier_multiplier", "in_band_fee", "tempo_reimbursement", "fee_row_insufficient"],
        "the parity corpus stopped covering one of the four duplicated decisions"
    );

    let failures: Vec<String> = suite
        .cases
        .iter()
        .filter_map(|case| run(case).err().map(|e| format!("  {}: {e}", case.name)))
        .collect();
    assert!(
        failures.is_empty(),
        "{} of {} fee-policy parity cases FAILED (the Rust and TypeScript fee halves have \
         drifted — fix the one that moved, never the corpus):\n{}",
        failures.len(),
        suite.cases.len(),
        failures.join("\n")
    );
}
