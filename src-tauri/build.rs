fn main() {
    // tauri-plugin-apple-intelligence links the Swift runtime, which the binary
    // references as @rpath/libswift_Concurrency.dylib. cargo/rustc doesn't add the
    // Swift runtime search path the way the Swift toolchain would, so without this
    // rpath the app (and test binaries) crash at launch with "no LC_RPATH's found".
    // The macOS Swift runtime lives in the dyld shared cache under /usr/lib/swift.
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        println!("cargo:rustc-link-arg=-Wl,-rpath,/usr/lib/swift");
    }

    tauri_build::build()
}
