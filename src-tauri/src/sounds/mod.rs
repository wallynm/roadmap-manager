use std::process::Command;

#[derive(Debug, Clone, Copy)]
pub enum SoundKind {
    AgentStart,
    AgentFinished,
    AgentError,
    Notification,
}

impl SoundKind {
    fn file_name(&self) -> &'static str {
        match self {
            Self::AgentStart => "Tink.aiff",
            Self::AgentFinished => "Glass.aiff",
            Self::AgentError => "Funk.aiff",
            Self::Notification => "Pop.aiff",
        }
    }
}

pub fn play(kind: SoundKind) {
    let path = format!("/System/Library/Sounds/{}", kind.file_name());
    std::thread::spawn(move || {
        let _ = Command::new("afplay").arg(&path).output();
    });
}
