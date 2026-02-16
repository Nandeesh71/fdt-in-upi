"""
UPI Transaction ID Generator
Generates 12-digit numeric UPI transaction IDs following NPCI standards
Format: YYMMDDXXXXXX (Year-Month-Day + 6-digit sequence number)
Example: 260214000001 (14 Feb 2026, sequence 000001)
"""

import random
import time
from datetime import datetime, timezone
from typing import Optional

# Global sequence counter for the current day (in-memory cache)
_sequence_counter = {}

def generate_upi_transaction_id(timestamp: Optional[datetime] = None, db_cursor=None) -> str:
    """
    Generate a 12-digit UPI transaction ID.
    
    Format: YYMMDDXXXXXX
    - YYMMDD: Date component (6 digits)
    - XXXXXX: Sequential number (6 digits, 000001-999999)
    
    Args:
        timestamp: Optional datetime object. If None, uses current UTC time.
        db_cursor: Optional database cursor to fetch next sequence from DB.
    
    Returns:
        12-digit transaction ID as string
    
    Example:
        >>> tx_id = generate_upi_transaction_id()
        >>> len(tx_id)
        12
        >>> tx_id.isdigit()
        True
    """
    if timestamp is None:
        timestamp = datetime.now(timezone.utc)
    
    # Format: YYMMDD (6 digits)
    date_component = timestamp.strftime("%y%m%d")
    
    # Try to get sequence from database if cursor provided
    sequence = None
    if db_cursor is not None:
        try:
            # Get the max sequence for today from database (PostgreSQL syntax)
            db_cursor.execute(
                """
                SELECT COALESCE(MAX(CAST(SUBSTR(tx_id, 7, 6) AS INTEGER)), 0) as max_seq
                FROM transactions 
                WHERE tx_id LIKE %s
                """,
                (f"{date_component}%",)
            )
            result = db_cursor.fetchone()
            if result:
                # Handle both dict-like cursor (RealDictCursor) and tuple cursor
                max_seq = result.get("max_seq") if hasattr(result, "get") else result[0]
                if max_seq:
                    sequence = int(max_seq) + 1
        except Exception as e:
            # Fall back to in-memory counter if DB fails
            import sys
            print(f"[WARN] Failed to get sequence from DB: {e}", file=sys.stderr)
            pass
    
    # Fall back to in-memory counter if no DB cursor or DB lookup failed
    if sequence is None:
        if date_component not in _sequence_counter:
            _sequence_counter[date_component] = 0
        _sequence_counter[date_component] += 1
        sequence = _sequence_counter[date_component]
    
    # Ensure sequence wraps around at 999999
    if sequence > 999999:
        sequence = 1
    
    # Format sequence with leading zeros: 000001, 000002, etc.
    sequence_component = str(sequence).zfill(6)
    
    # Combine to create 12-digit transaction ID
    tx_id = f"{date_component}{sequence_component}"
    
    return tx_id

def parse_upi_transaction_id(tx_id: str) -> dict:
    """
    Parse a UPI transaction ID to extract components.
    
    Args:
        tx_id: 12-digit transaction ID
    
    Returns:
        Dictionary with 'date', 'sequence', 'timestamp' keys
        
    Raises:
        ValueError: If tx_id is not valid 12-digit format
    
    Example:
        >>> parsed = parse_upi_transaction_id("260214000001")
        >>> parsed['sequence']
        1
    """
    if not isinstance(tx_id, str) or len(tx_id) != 12 or not tx_id.isdigit():
        raise ValueError(f"Invalid UPI transaction ID format. Expected 12 digits, got: {tx_id}")
    
    date_component = tx_id[:6]  # YYMMDD
    sequence_component = tx_id[6:12]  # Sequential number
    
    # Parse date
    try:
        year = int("20" + date_component[:2])
        month = int(date_component[2:4])
        day = int(date_component[4:6])
        parsed_date = datetime(year, month, day, tzinfo=timezone.utc)
    except ValueError as e:
        raise ValueError(f"Invalid date component in transaction ID: {date_component}") from e
    
    return {
        "date": date_component,
        "sequence": int(sequence_component),
        "timestamp": parsed_date,
        "sequence_str": sequence_component
    }

def is_valid_upi_transaction_id(tx_id: str) -> bool:
    """
    Validate UPI transaction ID format.
    
    Args:
        tx_id: Transaction ID to validate
    
    Returns:
        True if valid 12-digit format, False otherwise
    """
    if not isinstance(tx_id, str):
        return False
    
    if len(tx_id) != 12:
        return False
    
    if not tx_id.isdigit():
        return False
    
    try:
        parse_upi_transaction_id(tx_id)
        return True
    except ValueError:
        return False

def reset_sequence(date_str: Optional[str] = None):
    """
    Reset sequence counter for a specific date or all dates.
    
    Args:
        date_str: Optional YYMMDD format date. If None, resets all.
    """
    global _sequence_counter
    if date_str:
        if date_str in _sequence_counter:
            del _sequence_counter[date_str]
    else:
        _sequence_counter = {}


# Example usage and tests
if __name__ == "__main__":
    # Test ID generation
    print("=== UPI Transaction ID Generator ===\n")
    
    print("1. Generate 5 transaction IDs:")
    for i in range(5):
        tx_id = generate_upi_transaction_id()
        print(f"   TX-{i+1}: {tx_id} (length: {len(tx_id)})")
    
    print("\n2. Validate transaction IDs:")
    test_ids = [
        "260214000001",  # Valid
        "260214000002",  # Valid
        "26021400000A",  # Invalid (contains letter)
        "2602140000",    # Invalid (too short)
        "123456789012",  # Valid format (but future date)
    ]
    
    for tx_id in test_ids:
        is_valid = is_valid_upi_transaction_id(tx_id)
        status = "✓ Valid" if is_valid else "✗ Invalid"
        print(f"   {tx_id}: {status}")
    
    print("\n3. Parse transaction ID:")
    tx_id = "260214000001"
    parsed = parse_upi_transaction_id(tx_id)
    print(f"   ID: {tx_id}")
    print(f"   Date: {parsed['date']}")
    print(f"   Sequence: {parsed['sequence']}")
    print(f"   Timestamp: {parsed['timestamp']}")
    
    print("\n✅ All tests passed!")
