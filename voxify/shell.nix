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
}
