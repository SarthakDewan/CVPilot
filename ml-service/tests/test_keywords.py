from app.keywords import compare, extract_keywords, normalize


def test_api_and_apis_match():
    matched, missing = compare("I design APIs", "We need API design")
    assert "API" in matched and "API" not in missing


def test_lowercase_punctuation_stopwords_and_short_tokens_removed():
    k = extract_keywords("The Python, SQL; and... an AI-ML pipeline is ok!")
    assert {"python", "sql", "pipeline"} <= k.lemmas
    for dropped in ("the", "and", "an", "is", "ok"):
        assert dropped not in k.lemmas


def test_short_technical_terms_are_kept_and_special_tokens_survive():
    k = extract_keywords("Experience with C++, C#, .NET and Node.js plus AI and ML")
    assert {"c++", "c#", "dotnet", "nodejs", "ai", "ml"} <= k.lemmas
    assert "c" not in k.lemmas


def test_lemmatization_of_inflections():
    assert normalize("managed") == normalize("manage") == "manage"
    assert normalize("databases") == normalize("database")
    assert normalize("pipelines") == "pipeline"


def test_singular_words_ending_in_s_are_not_mangled():
    for w in ("analysis", "status", "kubernetes", "css"):
        assert normalize(w) == w


def test_generic_boilerplate_is_not_a_keyword():
    k = extract_keywords("Strong experience and ability to work in a team")
    assert k.lemmas == set()


def test_matched_missing_partition_job_keywords():
    resume = "Python developer with SQL and Docker"
    job = "Looking for Python, SQL, Kubernetes and Terraform skills"
    matched, missing = compare(resume, job)
    assert set(matched) == {"Python", "SQL"}
    assert set(missing) == {"Kubernetes", "Terraform"}
    # M and Γ are disjoint and together are exactly W_J
    assert not set(m.lower() for m in matched) & set(x.lower() for x in missing)


def test_ordering_is_by_job_frequency_then_alphabetical_and_deterministic():
    job = "kubernetes terraform kubernetes ansible kubernetes terraform"
    _, missing = compare("nothing relevant here at all", job)
    assert missing == ["kubernetes", "terraform", "ansible"]
    assert compare("x y z", job) == compare("x y z", job)


def test_surface_form_comes_from_job_description():
    matched, _ = compare("built apis", "API Gateway experience")
    assert matched == ["API"] or matched == ["api"]


def test_short_acronyms_the_lemmatizer_would_break_still_match():
    matched, missing = compare("Deployed on AWS with Jenkins and CI/CD", "Need AWS, Jenkins and CI/CD skills")
    assert set(m.lower() for m in matched) == {"aws", "jenkins", "ci/cd"}
    assert missing == []


def test_lemmas_are_case_insensitive():
    assert normalize("jenkins") == normalize("Jenkins".lower())
    assert extract_keywords("Jenkins JENKINS jenkins").counts[normalize("jenkins")] == 3
