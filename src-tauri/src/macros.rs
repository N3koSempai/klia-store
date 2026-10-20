// Debug-only tracing: compiles to a no-op in release builds so verbose
// internal logs never reach stdout/stderr (and journald under systemd).
macro_rules! debug_println {
    ($($arg:tt)*) => {
        {
            #[cfg(debug_assertions)]
            println!($($arg)*);
            #[cfg(not(debug_assertions))]
            let _ = format_args!($($arg)*);
        }
    };
}
macro_rules! debug_eprintln {
    ($($arg:tt)*) => {
        {
            #[cfg(debug_assertions)]
            eprintln!($($arg)*);
            #[cfg(not(debug_assertions))]
            let _ = format_args!($($arg)*);
        }
    };
}

