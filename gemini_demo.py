"""Run the Gemini interaction example separately from Flask startup."""

from google import genai


def main() -> None:
    client = genai.Client()

    # Server-side state (recommended).
    interaction1 = client.interactions.create(
        model="gemini-3.8-flash",
        input="I have 2 dogs in my house.",
    )
    print("Response 1:", interaction1.output_text)

    interaction2 = client.interactions.create(
        model="gemini-3.8-flash",
        input="How many paws are in my house?",
        previous_interaction_id=interaction1.id,
    )
    print("Response 2:", interaction2.output_text)


if __name__ == "__main__":
    main()
