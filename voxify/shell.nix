{ pkgs ? import <nixpkgs> {} }:

pkgs.mkShell {
  nativeBuildInputs = with pkgs; [
    pkg-config
  ];

  buildInputs = with pkgs; [
    cargo
    rustc
    clippy
    rustfmt
    gcc
    openssl
  ];

  # Variables d'environnement optionnelles pour aider pkg-config à trouver OpenSSL si besoin
  PKG_CONFIG_PATH = "${pkgs.openssl.dev}/lib/pkgconfig";
}
