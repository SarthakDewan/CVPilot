import json

import pytest

from app import scam

S = scam.Settings(theta1=0.25, theta2=0.5, w_r=0.5)
FILL = " We are hiring a software engineer to build backend services in Python."


def fired_ids(text):
    return [f.id for f in scam.screen(text, settings=S).fired]


class TestRules:
    @pytest.mark.parametrize("text", [
        "Candidates must pay a registration fee of Rs 2000.",
        "A refundable security deposit is required before joining.",
        "Please transfer the training charges to confirm your seat.",
    ])
    def test_h1_upfront_fee(self, text):
        assert fired_ids(text + FILL) == ["h1"]

    @pytest.mark.parametrize("text", [
        "Share your bank account details to receive the offer.",
        "Send the OTP you receive to our recruiter.",
        "Payment by wire transfer or Western Union.",
        "Provide your debit card number and CVV.",
    ])
    def test_h2_bank_otp(self, text):
        assert fired_ids(text + FILL) == ["h2"]

    @pytest.mark.parametrize("text", [
        "Guaranteed placement after the course.",
        "100% job guarantee!",
        "No interview needed, instant joining.",
        "Get hired without an interview.",
    ])
    def test_h3_guaranteed(self, text):
        assert fired_ids(text + FILL) == ["h3"]

    @pytest.mark.parametrize("email", ["hr.jobs@gmail.com", "recruit@yahoo.co.in", "careers@Hotmail.com", "x@outlook.com"])
    def test_h4_personal_email(self, email):
        assert fired_ids(f"Send your CV to {email}." + FILL) == ["h4"]

    def test_company_email_does_not_fire(self):
        assert fired_ids("Apply at careers@acme-corp.com." + FILL) == []

    @pytest.mark.parametrize("text", [
        "There is no registration fee.", "We never ask for a security deposit.", "Zero joining fee for candidates.",
        "We do not ask for bank account details.",
    ])
    def test_negated_statements_do_not_fire(self, text):
        assert fired_ids(text + FILL) == []

    def test_clean_listing_is_safe(self):
        r = scam.screen("Senior Python developer. 5 years experience. Apply via our careers page." + FILL, settings=S)
        assert (r.rho, r.band, r.fired) == (0.0, "safe", [])

    def test_evidence_and_reasons_are_human_readable(self):
        r = scam.screen("Pay a registration fee now." + FILL, settings=S)
        f = r.fired[0]
        assert "registration fee" in f.evidence.lower()
        assert f.reason and f.name == "Upfront fee or deposit"
        assert {c["id"]: c["fired"] for c in r.checked} == {"h1": True, "h2": False, "h3": False, "h4": False}


class TestFusionAndBands:
    @pytest.mark.parametrize("n_fired,band", [(0, "safe"), (1, "caution"), (2, "high"), (3, "high"), (4, "high")])
    def test_rule_only_bands_with_default_thresholds(self, n_fired, band):
        # rho = n/4: 0 -> safe, 0.25 -> caution (theta1 inclusive), 0.5 -> high (theta2 inclusive)
        assert scam.band_for(n_fired / 4, S) == band

    def test_band_boundaries(self):
        assert scam.band_for(0.2499, S) == "safe"
        assert scam.band_for(0.25, S) == "caution"
        assert scam.band_for(0.4999, S) == "caution"
        assert scam.band_for(0.5, S) == "high"

    def test_fusion_formula(self):
        risk, mode = scam.fuse(0.5, 0.9, scam.Settings(w_r=0.4))
        assert mode == "hybrid" and risk == pytest.approx(0.4 * 0.5 + 0.6 * 0.9)

    def test_rule_only_fallback_when_no_classifier(self):
        risk, mode = scam.fuse(0.75, None, S)
        assert (risk, mode) == (0.75, "rule-only")

    def test_screen_uses_classifier_when_present(self):
        class Fake:
            def predict_proba(self, text):
                return 1.0

        r = scam.screen("Normal company posting with no red flags." + FILL, classifier=Fake(), settings=S)
        assert r.mode == "hybrid" and r.p_clf == 1.0 and r.risk == 0.5 and r.band == "high"
        r2 = scam.screen("Normal company posting with no red flags." + FILL, settings=S)
        assert r2.mode == "rule-only" and r2.p_clf is None and r2.band == "safe"

    def test_settings_validation(self, monkeypatch):
        monkeypatch.setenv("SCAM_THETA1", "0.6")
        monkeypatch.setenv("SCAM_THETA2", "0.5")
        with pytest.raises(ValueError):
            scam.Settings.from_env()


class TestDataDrivenRules:
    def test_extra_rule_from_file_is_picked_up_and_changes_m(self, tmp_path):
        data = json.loads(scam.DEFAULT_RULES_PATH.read_text())
        data["rules"].append({"id": "h5", "name": "WhatsApp only", "reason": "Recruits only via WhatsApp",
                              "type": "regex", "patterns": ["\\bwhatsapp\\b"]})
        path = tmp_path / "rules.json"
        path.write_text(json.dumps(data))
        rs = scam.load_rules(path)
        rho, fired, _ = scam.rule_score("Message us on WhatsApp to apply." + FILL, rs)
        assert [f.id for f in fired] == ["h5"] and rho == pytest.approx(1 / 5)

    def test_unknown_rule_type_is_rejected(self, tmp_path):
        data = json.loads(scam.DEFAULT_RULES_PATH.read_text())
        data["rules"] = [{"id": "x", "name": "x", "reason": "x", "type": "magic"}]
        path = tmp_path / "bad.json"
        path.write_text(json.dumps(data))
        with pytest.raises(ValueError):
            scam.rule_score("anything at all here", scam.load_rules(path))


def test_classifier_loader_returns_none_without_model_file(monkeypatch, tmp_path):
    monkeypatch.setenv("SCAM_MODEL_PATH", str(tmp_path / "missing.joblib"))
    scam.reset_caches()
    assert scam.get_classifier() is None
    scam.reset_caches()


def test_negation_does_not_leak_across_sentences():
    # "no interview." negates nothing about the fee in the next sentence
    assert fired_ids("Guaranteed job, no interview. Pay a registration fee today." + FILL) == ["h1", "h3"]
    assert fired_ids("Great team. No registration fee; pay a security deposit to start." + FILL) == ["h1"]


def test_evidence_snippets_are_whole_words_with_ellipsis():
    text = ("Congratulations on your selection for this remote data entry position at our company. "
            "Please pay a refundable registration fee of Rs 1500 and send the receipt to confirm your seat today.")
    ev = scam.screen(text, settings=S).fired[0].evidence
    assert "registration fee" in ev and ev.startswith("…") and ev.endswith("…")
    inner = ev.strip("…").split(" ")
    assert all(w in text.split(" ") for w in inner)  # no word is cut in half
    assert scam.screen("Pay a registration fee.", settings=S).fired[0].evidence == "Pay a registration fee."
