pub mod deps;
pub mod fix;
pub mod impact;
#[cfg(test)]
mod tests;

use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::Path;

use crate::parser;
use crate::scanner::{walk_template_files, RepoConfig};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ValidationIssue {
    pub file: String,
    pub template: String,
    pub missing: Vec<String>,
    pub extra: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ValidationReport {
    pub checked: u32,
    pub passing: u32,
    pub failing: u32,
    pub issues: Vec<ValidationIssue>,
    pub orphan_files: Vec<String>,
}

pub fn validate(repo_path: &Path, config: &RepoConfig) -> ValidationReport {
    let template_files = walk_template_files(repo_path, config);

    let mut report = ValidationReport {
        checked: 0,
        passing: 0,
        failing: 0,
        issues: Vec::new(),
        orphan_files: Vec::new(),
    };

    for tf in &template_files {
        let template = match config.templates.get(&tf.template_name) {
            Some(t) => t,
            None => continue,
        };

        let content = match std::fs::read_to_string(&tf.abs_path) {
            Ok(c) => c,
            Err(_) => continue,
        };

        let parsed = match parser::parse(&content) {
            Ok(p) => p,
            Err(_) => {
                report.checked += 1;
                report.failing += 1;
                report.issues.push(ValidationIssue {
                    file: tf.rel_path.clone(),
                    template: tf.template_name.clone(),
                    missing: template.required_fields.clone(),
                    extra: Vec::new(),
                });
                continue;
            }
        };

        report.checked += 1;

        let yaml_keys: HashSet<String> = parsed
            .yaml
            .as_mapping()
            .map(|m| m.keys().filter_map(|k| k.as_str().map(String::from)).collect())
            .unwrap_or_default();

        let mut missing: Vec<String> = Vec::new();
        for field in &template.required_fields {
            if !yaml_keys.contains(field.as_str()) {
                missing.push(field.clone());
                continue;
            }
            let val = parser::extract_string(&parsed.yaml, field).unwrap_or_default();
            if val.trim().is_empty() {
                missing.push(field.clone());
            }
        }

        let known_fields: HashSet<&str> =
            template.frontmatter_fields.iter().map(|s| s.as_str()).collect();
        let extra: Vec<String> = yaml_keys
            .iter()
            .filter(|k| !known_fields.contains(k.as_str()))
            .cloned()
            .collect();

        if missing.is_empty() {
            report.passing += 1;
        } else {
            report.failing += 1;
            report.issues.push(ValidationIssue {
                file: tf.rel_path.clone(),
                template: tf.template_name.clone(),
                missing,
                extra,
            });
        }
    }

    report
}
