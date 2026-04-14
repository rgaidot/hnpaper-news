use indicatif::{MultiProgress, ProgressBar, ProgressStyle};
use std::sync::{Arc, Mutex};
use std::time::Instant;

pub struct ProgressStats {
    pub success: usize,
    pub failed: usize,
}

pub struct ProgressManager {
    multi: MultiProgress,
    global_bar: ProgressBar,
    stats: Arc<Mutex<ProgressStats>>,
    total_files: usize,
    global_start: Instant,
    completion_times: Arc<Mutex<Vec<u64>>>,
    is_ci: bool,
}

impl ProgressManager {
    pub fn new(total_files: usize) -> Self {
        let is_ci = std::env::var("CI").is_ok();
        let multi = MultiProgress::new();

        let global_style = if is_ci {
            ProgressStyle::with_template("{prefix:.bold.cyan} {pos}/{len} ({percent}%) | {msg}")
                .unwrap()
        } else {
            ProgressStyle::with_template(
                "{spinner:.green.bold} {prefix:.bold.cyan} [{elapsed_precise:.dim}] {wide_bar:.cyan/blue} {pos}/{len} ({percent}%) | {msg}",
            )
            .unwrap()
            .progress_chars("██░")
        };

        let global_bar = multi.add(ProgressBar::new(total_files as u64));
        global_bar.set_style(global_style);
        global_bar.set_prefix("Overall Progress");
        global_bar.set_message("Starting...");

        if !is_ci {
            global_bar.enable_steady_tick(std::time::Duration::from_millis(100));
        }

        Self {
            multi,
            global_bar,
            stats: Arc::new(Mutex::new(ProgressStats {
                success: 0,
                failed: 0,
            })),
            total_files,
            global_start: Instant::now(),
            completion_times: Arc::new(Mutex::new(Vec::new())),
            is_ci,
        }
    }

    pub fn increment_success(&self, elapsed_ms: u64) {
        let mut stats = self.stats.lock().unwrap();
        stats.success += 1;
        self.completion_times.lock().unwrap().push(elapsed_ms);
        self.update_global_bar(&stats);
    }

    pub fn increment_failed(&self) {
        let mut stats = self.stats.lock().unwrap();
        stats.failed += 1;
        self.update_global_bar(&stats);
    }

    pub fn log_success(&self, filename: &str, msg: &str) {
        if self.is_ci {
            println!("  ✔ {}: {}", filename, msg);
            return;
        }
        let _ = self.multi.println(format!(
            "  {} {}: {}",
            console::style("✔").green(),
            console::style(filename).bold(),
            msg
        ));
    }

    fn update_global_bar(&self, stats: &ProgressStats) {
        let current = stats.success + stats.failed;
        self.global_bar.set_position(current as u64);

        let times = self.completion_times.lock().unwrap();
        let eta_str = if times.len() >= 2 {
            let avg_ms: u64 = times.iter().sum::<u64>() / (times.len() as u64);
            let remaining = (self.total_files - current) as u64;
            let eta_ms = avg_ms * remaining;
            format!(" | ETA {}", format_duration(eta_ms))
        } else {
            String::new()
        };

        let msg = format!(
            "✔ {} ✘ {}{}",
            stats.success, stats.failed, eta_str
        );
        self.global_bar.set_message(msg);
    }

    pub fn create_article_bar(&self, filename: &str, steps: u64) -> ProgressBar {
        if self.is_ci {
            return ProgressBar::hidden();
        }
        let pb = self.multi.add(ProgressBar::new(steps));
        let style = ProgressStyle::with_template(
            "  {spinner:.yellow} {prefix:.bold.blue} {bar:.white.dim} {pos}/{len} | {msg}",
        )
        .unwrap()
        .progress_chars("██░");
        pb.set_style(style);
        pb.set_prefix(filename.to_string());
        pb.set_message("preparing...");
        pb.enable_steady_tick(std::time::Duration::from_millis(100));
        pb
    }

    pub fn remove_article_bar(&self, pb: &ProgressBar) {
        if !self.is_ci {
            pb.finish_and_clear();
        }
    }

    pub fn stop(&self) {
        self.global_bar.finish();
    }

    pub fn print_summary(&self) {
        let stats = self.stats.lock().unwrap();
        let elapsed_ms = self.global_start.elapsed().as_millis() as u64;
        println!("\n━━━ Summary ━━━\n");
        println!("  ✔ Success  : {}", stats.success);
        println!("  ✘ Failed   : {}\n", stats.failed);
        println!("  Total time : {}", format_duration(elapsed_ms));

        let times = self.completion_times.lock().unwrap();
        if !times.is_empty() {
            let avg_ms: u64 = times.iter().sum::<u64>() / (times.len() as u64);
            println!("  Avg/file   : {}", format_duration(avg_ms));
        }
    }
}

pub fn format_duration(ms: u64) -> String {
    let s = ms / 1000;
    if s < 60 {
        return format!("{}s", s);
    }
    let m = s / 60;
    let rem_s = s % 60;
    if m < 60 {
        return if rem_s > 0 {
            format!("{}m{}s", m, rem_s)
        } else {
            format!("{}m", m)
        };
    }
    let h = m / 60;
    let rem_m = m % 60;
    if rem_m > 0 {
        format!("{}h{}m", h, rem_m)
    } else {
        format!("{}h", h)
    }
}
