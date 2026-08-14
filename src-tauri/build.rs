fn main() {
    println!("cargo:rerun-if-env-changed=WIKIMEDIA_CONTACT");
    tauri_build::build()
}
