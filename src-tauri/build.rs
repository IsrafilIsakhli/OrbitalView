fn main() {
    println!("cargo:rerun-if-env-changed=WIKIMEDIA_CONTACT");
    println!("cargo:rerun-if-env-changed=ORBITAL_PACKAGE_KIND");
    tauri_build::build()
}
