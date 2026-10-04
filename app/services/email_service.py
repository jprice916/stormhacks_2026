import os

import mailtrap as mt


class EmailConfigurationError(RuntimeError):
    """Raised when required Mailtrap sender credentials are unavailable."""


class EmailService:
    """Send account verification messages through Mailtrap."""

    def __init__(self, client=None):
        self._client = client

    def send_verification_email(
        self,
        recipient_email: str,
        verification_url: str,
        *,
        recipient_name: str | None = None,
    ):
        """Send a verification link; the caller is responsible for creating it."""
        token = os.getenv("MAILTRAP_API_TOKEN")
        sender_email = os.getenv("MAILTRAP_SENDER_EMAIL")
        sender_name = os.getenv("MAILTRAP_SENDER_NAME", "StormHacks")
        if not token or not sender_email:
            raise EmailConfigurationError(
                "MAILTRAP_API_TOKEN and MAILTRAP_SENDER_EMAIL must be configured"
            )

        greeting = f"Hi {recipient_name}," if recipient_name else "Hello,"
        message = mt.Mail(
            sender=mt.Address(email=sender_email, name=sender_name),
            to=[mt.Address(email=recipient_email)],
            subject="Verify your StormHacks account",
            text=(
                f"{greeting}\n\n"
                "Please verify your email address by opening this link:\n"
                f"{verification_url}\n\n"
                "This link expires in 24 hours.\n\n"
                "If you did not create a StormHacks account, you can ignore this email."
            ),
            category="Account Verification",
        )
        client = self._client or mt.MailtrapClient(token=token)
        return client.send(message)