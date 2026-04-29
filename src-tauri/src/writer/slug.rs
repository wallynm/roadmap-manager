use unicode_normalization::UnicodeNormalization;

pub fn slugify(s: &str) -> String {
    let normalized: String = s.nfd().filter(|c| !c.is_ascii_control()).collect();

    let ascii: String = normalized
        .chars()
        .filter_map(|c| {
            if c.is_ascii_alphanumeric() || c == ' ' || c == '-' || c == '_' {
                Some(c.to_ascii_lowercase())
            } else if c.is_alphanumeric() {
                None
            } else {
                Some('-')
            }
        })
        .collect();

    let slug: String = ascii
        .split_whitespace()
        .collect::<Vec<_>>()
        .join("-")
        .chars()
        .fold(String::new(), |mut acc, c| {
            if c == '-' && acc.ends_with('-') {
                acc
            } else {
                acc.push(c);
                acc
            }
        });

    let trimmed = slug.trim_matches('-').to_string();

    if trimmed.len() > 60 {
        trimmed[..60].trim_end_matches('-').to_string()
    } else {
        trimmed
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_basic_slug() {
        assert_eq!(slugify("Hello World"), "hello-world");
    }

    #[test]
    fn test_accents() {
        assert_eq!(slugify("ação não funciona"), "acao-nao-funciona");
    }

    #[test]
    fn test_special_chars() {
        assert_eq!(slugify("foo/bar & baz!"), "foo-bar-baz");
    }

    #[test]
    fn test_max_length() {
        let long = "a".repeat(100);
        assert!(slugify(&long).len() <= 60);
    }
}
