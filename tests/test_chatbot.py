"""
Test script for AI Chatbot functionality
Run this to verify the chatbot is working correctly
"""
import os
import sys

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.chatbot import FraudDetectionChatbot


def test_chatbot():
    print("=" * 60)
    print("UPI Fraud Detection - Chatbot Test")
    print("=" * 60)
    print()
    
    # Get configuration
    db_url = os.getenv("DB_URL", "postgresql://fdt:fdtpass@127.0.0.1:5433/fdt_db")
    groq_key = os.getenv("GROQ_API_KEY")
    
    print(f"Database URL: {db_url[:30]}...")
    print(f"Groq API Key: {'✓ Configured' if groq_key else '✗ Not configured (fallback mode)'}")
    print()
    
    # Initialize chatbot
    try:
        chatbot = FraudDetectionChatbot(
            db_url=db_url,
            groq_api_key=groq_key
        )
        print(f"✓ Chatbot initialized (Mode: {chatbot.ai_provider.upper()})")
    except Exception as e:
        print(f"✗ Failed to initialize chatbot: {e}")
        return
    
    print()
    print("-" * 60)
    print("Testing chatbot responses...")
    print("-" * 60)
    print()
    
    # Test queries
    test_questions = [
        "What's the total transaction count?",
        "Show me high-risk transactions",
        "What's the average risk score?",
        "Tell me about blocked transactions"
    ]
    
    for i, question in enumerate(test_questions, 1):
        print(f"Question {i}: {question}")
        try:
            result = chatbot.chat(message=question, time_range="24h")
            print(f"Response: {result['response'][:200]}...")
            print(f"Context: {result['context_used']}")
            print()
        except Exception as e:
            print(f"✗ Error: {e}")
            print()
    
    print("=" * 60)
    print("Test completed!")
    print("=" * 60)


if __name__ == "__main__":
    # Load environment variables
    try:
        from dotenv import load_dotenv
        load_dotenv()
        print("✓ Loaded .env file")
    except ImportError:
        print("ℹ python-dotenv not installed (optional)")
    except Exception:
        print("ℹ No .env file found (optional)")
    
    print()
    test_chatbot()
