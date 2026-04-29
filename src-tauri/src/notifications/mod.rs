use std::process::Command;

pub fn send_native(title: &str, body: &str) {
    let script = format!(
        "display notification \"{}\" with title \"{}\"",
        body.replace('"', "'"),
        title.replace('"', "'")
    );
    let _ = Command::new("osascript")
        .arg("-e")
        .arg(&script)
        .output();
}
