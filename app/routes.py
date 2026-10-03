"""HTTP routes for the starter app."""

from flask import Blueprint, jsonify, render_template

main = Blueprint("main", __name__)


@main.get("/")
def index():
    return render_template("index.html")


@main.get("/health")
def health():
    return jsonify(status="ok")
