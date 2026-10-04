"""Authentication and email-verification tokens for TiDB users."""

import base64
import hashlib
import json

from cryptography.fernet import Fernet, InvalidToken
from flask_login import UserMixin
from pymysql.err import IntegrityError
from werkzeug.security import check_password_hash, generate_password_hash

from app.database import get_connection


class LoginUser(UserMixin):
	"""Authenticated user data safe to store in the Flask session."""

	def __init__(self, user_id: int, username: str, email: str):
		self.id = str(user_id)
		self.username = username
		self.email = email


class LoginService:
	"""Load users and verify passwords against stored Werkzeug hashes."""

	verification_token_max_age = 24 * 60 * 60

	def register_user(self, username: str, email: str, password: str) -> LoginUser | None:
		"""Create a user directly, storing only a password hash."""
		connection = get_connection()
		try:
			with connection.cursor() as cursor:
				cursor.execute(
					"""INSERT INTO users (username, email, password_hash)
					   VALUES (%s, %s, %s)""",
					(username, email, generate_password_hash(password)),
				)
				user_id = cursor.lastrowid
			connection.commit()
		except IntegrityError as error:
			connection.rollback()
			if error.args and error.args[0] == 1062:
				return None
			raise
		except Exception:
			connection.rollback()
			raise
		finally:
			connection.close()

		return LoginUser(user_id, username, email)

	@staticmethod
	def _verification_cipher(secret_key: str) -> Fernet:
		key = base64.urlsafe_b64encode(
			hashlib.sha256(b"stormhacks-email-verification:" + secret_key.encode("utf-8")).digest()
		)
		return Fernet(key)

	def create_verification_token(
		self,
		username: str,
		email: str,
		password: str,
		secret_key: str,
	) -> str:
		"""Create an encrypted, time-limited token without writing to the database."""
		payload = json.dumps({
			"username": username,
			"email": email,
			"password_hash": generate_password_hash(password),
		}).encode("utf-8")
		return self._verification_cipher(secret_key).encrypt(payload).decode("ascii")

	def verify_registration_token(self, token: str, secret_key: str) -> LoginUser | None:
		"""Create the account only after a valid email token is opened."""
		try:
			payload = json.loads(
				self._verification_cipher(secret_key).decrypt(
					token.encode("ascii"),
					ttl=self.verification_token_max_age,
				)
			)
		except (InvalidToken, TypeError, ValueError, UnicodeError):
			return None

		if not isinstance(payload, dict) or not all(
			isinstance(payload.get(field), str) and payload[field]
			for field in ("username", "email", "password_hash")
		):
			return None

		connection = get_connection()
		try:
			with connection.cursor() as cursor:
				cursor.execute(
					"""INSERT INTO users (username, email, password_hash)
					   VALUES (%s, %s, %s)""",
					(payload["username"], payload["email"], payload["password_hash"]),
				)
				user_id = cursor.lastrowid
			connection.commit()
		except IntegrityError as error:
			connection.rollback()
			if error.args and error.args[0] == 1062:
				return None
			raise
		except Exception:
			connection.rollback()
			raise
		finally:
			connection.close()

		return LoginUser(user_id, payload["username"], payload["email"])

	def load_user(self, user_id: str) -> LoginUser | None:
		try:
			numeric_id = int(user_id)
		except (TypeError, ValueError):
			return None

		connection = get_connection()
		try:
			with connection.cursor() as cursor:
				cursor.execute(
					"SELECT id, username, email FROM users WHERE id = %s LIMIT 1",
					(numeric_id,),
				)
				row = cursor.fetchone()
		finally:
			connection.close()

		if row is None:
			return None
		return LoginUser(row["id"], row["username"], row["email"])

	def authenticate(self, identity: str, password: str) -> LoginUser | None:
		identity = identity.strip()
		if not identity or not password:
			return None

		connection = get_connection()
		try:
			with connection.cursor() as cursor:
				cursor.execute(
					"""SELECT id, username, email, password_hash
					   FROM users
					   WHERE username = %s OR email = %s
					   LIMIT 1""",
					(identity, identity),
				)
				row = cursor.fetchone()
		finally:
			connection.close()

		if row is None:
			return None
		try:
			valid_password = check_password_hash(row["password_hash"], password)
		except (TypeError, ValueError):
			return None
		if not valid_password:
			return None
		return LoginUser(row["id"], row["username"], row["email"])
