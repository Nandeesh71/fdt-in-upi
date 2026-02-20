# app/chatbot.py
"""
AI Chatbot for UPI Fraud Detection System
Provides intelligent responses and analytics about fraud detection data
"""
import os
import json
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List
import psycopg2
import psycopg2.extras

try:
    from groq import Groq
    GROQ_AVAILABLE = True
except ImportError:
    GROQ_AVAILABLE = False
    print("Warning: Groq not available. Install with: pip install groq")


class FraudDetectionChatbot:
    def __init__(self, db_url: str, groq_api_key: str = None):
        self.db_url = db_url
        self.groq_api_key = groq_api_key or os.getenv("GROQ_API_KEY")
        self.ai_provider = "fallback"
        self._schema_cache = None  # Cache for database schema
        
        # Check if Groq is available
        if GROQ_AVAILABLE and self.groq_api_key:
            self.ai_provider = "groq"
        
        # Initialize Groq client
        if self.ai_provider == "groq":
            self.client = Groq(api_key=self.groq_api_key)
            self.use_ai = True
            print("Chatbot using Groq AI (Free & Fast!)")
        else:
            self.client = None
            self.use_ai = False
            print("Chatbot running in fallback mode (no Groq API key)")
    
    def get_conn(self):
        """Get database connection"""
        return psycopg2.connect(self.db_url, cursor_factory=psycopg2.extras.RealDictCursor)
    
    def get_transaction_details(self, tx_id: str) -> Dict[str, Any]:
        """Fetch detailed information about a specific transaction"""
        conn = self.get_conn()
        try:
            cur = conn.cursor()
            cur.execute("""
                SELECT * FROM public.transactions 
                WHERE tx_id = %s
            """, (tx_id,))
            tx = cur.fetchone()
            cur.close()
            return dict(tx) if tx else None
        finally:
            conn.close()
    
    def get_last_n_transactions(self, n: int = 5) -> List[Dict[str, Any]]:
        """Fetch the last N transactions"""
        conn = self.get_conn()
        try:
            cur = conn.cursor()
            cur.execute("""
                SELECT * FROM public.transactions 
                ORDER BY created_at DESC
                LIMIT %s
            """, (n,))
            txs = cur.fetchall()
            cur.close()
            return [dict(tx) for tx in txs]
        finally:
            conn.close()
    
    def get_highest_transaction(self, time_range: str = "24h") -> Dict[str, Any]:
        """Fetch the highest amount transaction in given time range"""
        conn = self.get_conn()
        try:
            # Determine time interval
            if time_range == "1h":
                interval = "1 hour"
            elif time_range == "7d":
                interval = "7 days"
            elif time_range == "30d":
                interval = "30 days"
            else:
                interval = "24 hours"
            
            cur = conn.cursor()
            cur.execute(f"""
                SELECT * FROM public.transactions 
                WHERE created_at >= NOW() - INTERVAL '{interval}'
                ORDER BY amount DESC
                LIMIT 1
            """)
            tx = cur.fetchone()
            cur.close()
            return dict(tx) if tx else None
        finally:
            conn.close()
    
    def get_analytics_context(self, time_range: str = "24h") -> Dict[str, Any]:
        """Fetch current analytics data from database"""
        conn = self.get_conn()
        try:
            cur = conn.cursor()
            
            # Determine time interval
            if time_range == "1h":
                interval = "1 hour"
            elif time_range == "24h":
                interval = "24 hours"
            elif time_range == "7d":
                interval = "7 days"
            elif time_range == "30d":
                interval = "30 days"
            else:
                interval = "24 hours"
            
            # Get overall stats
            cur.execute(f"""
                SELECT
                    COUNT(*) AS total,
                    COUNT(*) FILTER (WHERE action = 'BLOCK') AS blocked,
                    COUNT(*) FILTER (WHERE action = 'DELAY') AS delayed,
                    COUNT(*) FILTER (WHERE action = 'ALLOW') AS allowed,
                    COALESCE(AVG(risk_score), 0) AS avg_risk_score,
                    COALESCE(MAX(risk_score), 0) AS max_risk_score,
                    COALESCE(SUM(amount), 0) AS total_amount,
                    COALESCE(AVG(amount), 0) AS avg_amount
                FROM transactions
                WHERE created_at >= NOW() - INTERVAL '{interval}';
            """)
            stats = cur.fetchone()
            
            # Get high-risk transactions
            cur.execute(f"""
                SELECT tx_id, user_id, amount, risk_score, action, created_at
                FROM transactions
                WHERE created_at >= NOW() - INTERVAL '{interval}'
                    AND risk_score >= 0.7
                ORDER BY risk_score DESC
                LIMIT 10;
            """)
            high_risk_txs = cur.fetchall()
            
            # Get top users by transaction count
            cur.execute(f"""
                SELECT user_id, COUNT(*) as tx_count, AVG(risk_score) as avg_risk
                FROM transactions
                WHERE created_at >= NOW() - INTERVAL '{interval}'
                GROUP BY user_id
                ORDER BY tx_count DESC
                LIMIT 5;
            """)
            top_users = cur.fetchall()
            
            # Get trend data (hourly)
            cur.execute(f"""
                SELECT
                    DATE_TRUNC('hour', created_at) as hour,
                    COUNT(*) as total,
                    COUNT(*) FILTER (WHERE action = 'BLOCK') as blocked,
                    COUNT(*) FILTER (WHERE action = 'DELAY') as delayed,
                    COUNT(*) FILTER (WHERE action = 'ALLOW') as allowed
                FROM transactions
                WHERE created_at >= NOW() - INTERVAL '{interval}'
                GROUP BY hour
                ORDER BY hour DESC
                LIMIT 24;
            """)
            trends = cur.fetchall()
            
            cur.close()
            
            return {
                "stats": dict(stats) if stats else {},
                "high_risk_transactions": [dict(tx) for tx in high_risk_txs],
                "top_users": [dict(u) for u in top_users],
                "trends": [dict(t) for t in trends],
                "time_range": time_range
            }
        finally:
            conn.close()
    
    def execute_query(self, query: str, params: tuple = None) -> List[Dict[str, Any]]:
        """Execute raw SQL query (read-only - SELECT statements only for safety)"""
        # Security: Only allow SELECT queries
        query_stripped = query.strip().upper()
        if not query_stripped.startswith('SELECT'):
            raise ValueError("Only SELECT queries are allowed for security reasons")
        
        conn = self.get_conn()
        try:
            cur = conn.cursor()
            cur.execute(query, params)
            results = cur.fetchall()
            cur.close()
            return [dict(row) for row in results]
        finally:
            conn.close()
    
    def get_database_schema(self) -> Dict[str, Any]:
        """Get database schema information for AI context (cached)"""
        # Return cached schema if available
        if self._schema_cache is not None:
            return self._schema_cache
        
        conn = self.get_conn()
        try:
            cur = conn.cursor()
            
            # Get all tables
            cur.execute("""
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public'
            """)
            tables = cur.fetchall()
            
            schema_info = {}
            for table in tables:
                table_name = table['table_name']
                
                # Get columns for each table
                cur.execute("""
                    SELECT column_name, data_type, is_nullable
                    FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = %s
                    ORDER BY ordinal_position
                """, (table_name,))
                columns = cur.fetchall()
                
                schema_info[table_name] = [
                    {
                        'name': col['column_name'],
                        'type': col['data_type'],
                        'nullable': col['is_nullable']
                    }
                    for col in columns
                ]
            
            cur.close()
            # Cache the schema for future use
            self._schema_cache = schema_info
            return schema_info
        finally:
            conn.close()
    
    def generate_fallback_response(self, message: str, context: Dict[str, Any]) -> str:
        """Generate a response without AI (rule-based fallback)"""
        message_lower = message.lower()
        stats = context.get("stats", {})
        
        # Statistics queries
        if any(word in message_lower for word in ["total", "how many", "count"]):
            total = stats.get("total", 0)
            blocked = stats.get("blocked", 0)
            delayed = stats.get("delayed", 0)
            allowed = stats.get("allowed", 0)
            return (f"In the last {context.get('time_range', '24h')}, there were:\n"
                   f"• Total transactions: {total}\n"
                   f"• Blocked: {blocked} ({blocked/max(total,1)*100:.1f}%)\n"
                   f"• Delayed: {delayed} ({delayed/max(total,1)*100:.1f}%)\n"
                   f"• Allowed: {allowed} ({allowed/max(total,1)*100:.1f}%)")
        
        # Risk score queries
        elif any(word in message_lower for word in ["risk", "score", "average"]):
            avg_risk = stats.get("avg_risk_score", 0)
            max_risk = stats.get("max_risk_score", 0)
            return (f"Risk Score Analytics:\n"
                   f"• Average risk score: {avg_risk:.3f}\n"
                   f"• Maximum risk score: {max_risk:.3f}\n"
                   f"• High-risk transactions (>0.7): {len(context.get('high_risk_transactions', []))}")
        
        # Amount/money queries
        elif any(word in message_lower for word in ["amount", "money", "rupees", "₹"]):
            total_amount = stats.get("total_amount", 0)
            avg_amount = stats.get("avg_amount", 0)
            return (f"Transaction Amounts:\n"
                   f"• Total transaction volume: ₹{total_amount:,.2f}\n"
                   f"• Average transaction: ₹{avg_amount:,.2f}")
        
        # High-risk queries
        elif any(word in message_lower for word in ["high risk", "dangerous", "suspicious", "fraud"]):
            high_risk = context.get("high_risk_transactions", [])
            if not high_risk:
                return "No high-risk transactions detected in the selected time period."
            
            response = f"Found {len(high_risk)} high-risk transactions:\n\n"
            for tx in high_risk[:5]:
                response += (f"• TX {tx.get('tx_id')}: Risk {tx.get('risk_score', 0):.3f}, "
                           f"Amount ₹{tx.get('amount', 0):,.2f}, "
                           f"Action: {tx.get('action')}\n")
            return response
        
        # Trend queries
        elif any(word in message_lower for word in ["trend", "pattern", "over time"]):
            trends = context.get("trends", [])
            if not trends:
                return "No trend data available for the selected period."
            
            recent = trends[0] if trends else {}
            return (f"Recent Trends:\n"
                   f"• Latest hour: {recent.get('total', 0)} transactions\n"
                   f"• Blocked: {recent.get('blocked', 0)}\n"
                   f"• Overall trend shows {len(trends)} data points in {context.get('time_range', '24h')}")
        
        # Top users queries
        elif any(word in message_lower for word in ["user", "top", "most active"]):
            top_users = context.get("top_users", [])
            if not top_users:
                return "No user activity data available."
            
            response = "Most Active Users:\n\n"
            for i, user in enumerate(top_users, 1):
                response += (f"{i}. User {user.get('user_id')}: {user.get('tx_count')} transactions, "
                           f"Avg risk: {user.get('avg_risk', 0):.3f}\n")
            return response
        
        # Help/greeting
        elif any(word in message_lower for word in ["hello", "hi", "help", "what can"]):
            return ("👋 Welcome to UPI Fraud Detection Assistant!\n\n"
                   "Your Synara is here to help you understand fraud patterns and transaction analytics.\n\n"
                   "═══ What I Can Help You With ═══\n\n"
                   "• 📊 Transaction statistics and counts\n"
                   "• 💻 Risk score analysis\n"
                   "• 🚫 High-risk transaction details\n"
                   "• 💰 Transaction amounts and volumes\n"
                   "• 👥 User activity patterns\n"
                   "• 📈 Trends over time\n\n"
                   "═══ Try Asking ═══\n\n"
                   "• \"Analyse last 5 transactions\"\n"
                   "• \"What's the fraud rate?\"\n"
                   "• \"Show blocked transactions\"\n"
                   "• \"Explain transaction [ID]\"\n\n"
                   "Just ask me anything about fraud detection!")
        
        # Default response
        else:
            total = stats.get("total", 0)
            blocked = stats.get("blocked", 0)
            return (f"I'm monitoring {total} transactions in the last {context.get('time_range', '24h')}. "
                   f"{blocked} were blocked. What would you like to know?")
    
    def generate_ai_response(self, message: str, context: Dict[str, Any], 
                            conversation_history: List[Dict[str, str]] = None) -> str:
        """Generate AI-powered response using Groq"""
        if not self.use_ai:
            return self.generate_fallback_response(message, context)
        
        try:
            # Check if user is asking about a specific transaction ID
            import re
            # UPI Transaction IDs are 12-digit numeric (YYMMDDXXXXXX format)
            tx_id_match = re.search(r'\b\d{12}\b', message)
            transaction_detail = ""
            
            if tx_id_match:
                tx_id = tx_id_match.group(0)
                tx = self.get_transaction_details(tx_id)
                if tx:
                    # Build detailed transaction info
                    transaction_detail = f"""

SPECIFIC TRANSACTION DETAILS:
Transaction ID: {tx.get('tx_id')}
User ID: {tx.get('user_id')}
Amount: ₹{tx.get('amount', 0):,.2f}
Risk Score: {tx.get('risk_score', 0):.3f}
Action: {tx.get('action', 'UNKNOWN')}
Status: {tx.get('db_status', 'UNKNOWN')}
Type: {tx.get('tx_type', 'UNKNOWN')}
Channel: {tx.get('channel', 'UNKNOWN')}
Recipient VPA: {tx.get('recipient_vpa', 'N/A')}
Device ID: {tx.get('device_id', 'N/A')}
Created: {tx.get('created_at', 'N/A')}

EXPLANATION OF ACTION:
- Risk Score {tx.get('risk_score', 0):.3f} indicates: """
                    
                    risk_score = float(tx.get('risk_score', 0))
                    if risk_score >= 0.6:
                        transaction_detail += "HIGH RISK - Transaction was BLOCKED to prevent fraud"
                    elif risk_score >= 0.3:
                        transaction_detail += "MEDIUM RISK - Transaction was DELAYED for additional verification"
                    else:
                        transaction_detail += "LOW RISK - Transaction was ALLOWED to proceed"
            
            # Check if user is asking about last 5 transactions
            elif any(word in message.lower() for word in ["last 5", "last five", "recent 5", "recent five", "last few"]):
                last_txs = self.get_last_n_transactions(5)
                if last_txs:
                    transaction_detail = "\n\nLAST 5 TRANSACTIONS:\n"
                    for i, tx in enumerate(last_txs, 1):
                        transaction_detail += f"""
{i}. TX ID: {tx.get('tx_id')}
   User: {tx.get('user_id')} | Amount: ₹{tx.get('amount', 0):,.2f}
   Risk Score: {tx.get('risk_score', 0):.3f} | Action: {tx.get('action')}
   Type: {tx.get('tx_type')} | Channel: {tx.get('channel')}
   Created: {tx.get('created_at')}"""
            
            # Check if user is asking about highest amount
            elif any(word in message.lower() for word in ["highest amount", "maximum amount", "largest amount", "biggest transaction"]):
                highest_tx = self.get_highest_transaction(context.get('time_range', '24h'))
                if highest_tx:
                    # Return formatted response directly without AI processing
                    response = f"""
━━━ HIGHEST AMOUNT ━━━

Amount: ₹{highest_tx.get('amount', 0):,.2f}

━━━ TRANSACTION DETAILS ━━━

• Transaction ID: {highest_tx.get('tx_id')}
• User: {highest_tx.get('user_id')}
• Risk Score: {highest_tx.get('risk_score', 0):.3f}
• Action: {highest_tx.get('action')}
• Type: {highest_tx.get('tx_type')}
• Channel: {highest_tx.get('channel')}
• Recipient VPA: {highest_tx.get('recipient_vpa', 'N/A')}
• Created: {highest_tx.get('created_at')}"""
                    return response.strip()
                else:
                    return f"No transactions found in the last {context.get('time_range', '24h')}."
            
            # Get database schema for complex queries (with error handling)
            schema_text = ""
            try:
                schema_info = self.get_database_schema()
                schema_text = "\n\nDATABASE SCHEMA:\n"
                for table_name, columns in schema_info.items():
                    schema_text += f"\n{table_name}:\n"
                    for col in columns:
                        schema_text += f"  - {col['name']} ({col['type']})\n"
            except Exception as e:
                print(f"Schema retrieval failed (non-critical): {e}")
                schema_text = "\n\nDATABASE SCHEMA: Available tables - users, transactions, admin_logs"
            
            # Prepare context information
            context_info = f"""You are an AI assistant for a UPI Fraud Detection System. 
You have access to real-time transaction data and analytics.

Current Analytics (Time Range: {context.get('time_range', '24h')}):
- Total Transactions: {context['stats'].get('total', 0)}
- Blocked: {context['stats'].get('blocked', 0)}
- Delayed: {context['stats'].get('delayed', 0)}
- Allowed: {context['stats'].get('allowed', 0)}
- Average Risk Score: {context['stats'].get('avg_risk_score', 0):.3f}
- Total Amount: ₹{context['stats'].get('total_amount', 0):,.2f}
- High-Risk Transactions: {len(context.get('high_risk_transactions', []))}

FRAUD DETECTION RULES:
- Risk Score >= 0.6: BLOCK transaction
- Risk Score >= 0.3: DELAY transaction (requires verification)
- Risk Score < 0.3: ALLOW transaction

TRANSACTION ANALYSIS FACTORS:
- Amount (unusual amounts trigger higher risk)
- User history (frequent transactions, patterns)
- Device ID (new devices, location mismatches)
- Transaction type and channel
- Recipient VPA patterns
{transaction_detail}
{schema_text}

DATABASE ACCESS:
You have read-only access to the database. You can execute SELECT queries to answer complex questions.
Available tables: users, transactions, admin_logs, credentials, push_tokens, passkey_credentials
Key columns in transactions: tx_id, user_id, amount, risk_score, action, db_status, tx_type, channel, recipient_vpa, device_id, created_at, updated_at

IMPORTANT: Only use SQL queries for:
- Retrieving specific transaction details (when user asks for a specific transaction ID)
- Finding transactions that match specific criteria (e.g., "transactions from user X", "show me blocked transactions")
- Detailed data that's not in the analytics summary above

NEVER use SQL queries for:
- General statistics questions (total count, blocked count, delayed count, etc.)
- Questions about how many transactions were blocked/delayed/allowed
- Average risk score, total amounts, or other aggregate statistics
- If the answer is already available in the Current Analytics data, use that instead

Answer these types of questions ONLY from the analytics data provided, do NOT mention SQL queries.

To query the database, include SQL in your response like:
SQL_QUERY: SELECT * FROM transactions WHERE action='BLOCK' LIMIT 5

Your role is to:
1. Answer questions about fraud detection metrics and analytics
2. Explain why specific transactions were blocked/delayed/allowed
3. Provide detailed analysis of recent transactions
4. Provide insights on transaction patterns and risks
5. Help users understand the data
6. Be concise and professional
7. Use the provided analytics data for general statistics - ALWAYS use this for counts, totals, and aggregates
8. Execute SQL queries ONLY when user asks for specific transaction details or lists (like "show me all transactions")
9. NEVER mention SQL queries, database queries, or offer to execute queries - just provide the answer based on what you have

CRITICAL: If you have the answer in the analytics data provided, give that answer directly and do NOT mention SQL queries.

FORMATTING INSTRUCTIONS FOR AMOUNT-RELATED QUERIES:
When user asks about highest amount, lowest amount, or total amounts:
1. Start with a BOLD decorative header using ━━━ style: ━━━ HIGHEST AMOUNT ━━━
2. Display the amount prominently using Indian Rupee format (₹X,XXX.XX)
3. Add transaction details below using bullet points (•)
4. For multiple transactions, list them clearly with amounts in descending order
5. Always add blank lines between sections for readability

FORMATTING INSTRUCTIONS:
- Use decorative section headers like ━━━ SECTION NAME ━━━ (or === SECTION NAME === if needed)
- Use bullet points (•) for lists and details
- Add blank lines between major sections (press Enter twice)
- Keep paragraphs short (2-3 lines max)
- Use numbers for sequential items (1. 2. 3.)
- DO NOT use markdown headers (no ## or # symbols)
- Focus on readability with proper spacing

When discussing amounts, use Indian Rupee (₹) format."""

            # Use Groq AI
            messages = [
                {"role": "system", "content": context_info},
                {"role": "user", "content": message}
            ]
            
            response = self.client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=messages,
                max_tokens=1000,
                temperature=0.7
            )
            
            # Format the response for better display
            formatted_response = response.choices[0].message.content.strip()
            
            # Normalize headers: convert markdown (##) and === SECTION === to decorative style
            normalized = []
            for raw_line in formatted_response.split('\n'):
                line = raw_line.strip()
                # Markdown headers
                if line.startswith('##') or line.startswith('#'):
                    title = line.lstrip('#').strip()
                    normalized.append('')
                    normalized.append(f'━━━ {title.upper()} ━━━')
                    normalized.append('')
                    continue
                # === SECTION === pattern
                import re
                m = re.match(r'^={3}\s*(.*?)\s*={3}$', line)
                if m:
                    title = m.group(1)
                    normalized.append('')
                    normalized.append(f'━━━ {title.upper()} ━━━')
                    normalized.append('')
                    continue
                normalized.append(line)

            # Clean excess blank lines (collapse multiples)
            cleaned = []
            prev_empty = False
            for ln in normalized:
                if ln.strip():
                    cleaned.append(ln.strip())
                    prev_empty = False
                elif not prev_empty:
                    cleaned.append('')
                    prev_empty = True

            # Trim trailing blank lines
            while cleaned and not cleaned[-1].strip():
                cleaned.pop()

            return '\n'.join(cleaned)
            
        except Exception as e:
            print(f"Groq API error: {e}")
            return self.generate_fallback_response(message, context)
    
    def _convert_datetime_objects(self, obj: Any) -> Any:
        """Recursively convert datetime and Decimal objects to JSON-serializable types"""
        from decimal import Decimal
        
        if isinstance(obj, datetime):
            return obj.isoformat()
        elif isinstance(obj, Decimal):
            return float(obj)
        elif isinstance(obj, dict):
            return {k: self._convert_datetime_objects(v) for k, v in obj.items()}
        elif isinstance(obj, list):
            return [self._convert_datetime_objects(item) for item in obj]
        return obj
    
    def chat(self, message: str, time_range: str = "24h", 
            conversation_history: List[Dict[str, str]] = None) -> Dict[str, Any]:
        """Main chat method"""
        # Get analytics context
        context = self.get_analytics_context(time_range)
        
        # Generate response
        if self.use_ai:
            response = self.generate_ai_response(message, context, conversation_history)
        else:
            response = self.generate_fallback_response(message, context)
        
        # Check if AI wants to execute a SQL query
        sql_results = None
        if "SQL_QUERY:" in response:
            # Extract SQL query from response
            import re
            sql_match = re.search(r'SQL_QUERY:\s*(.+?)(?=\n\n|\Z)', response, re.DOTALL)
            if sql_match:
                sql_query = sql_match.group(1).strip()
                try:
                    sql_results = self.execute_query(sql_query)
                    # Remove SQL_QUERY from response (don't show raw JSON to user)
                    response = response.replace(f"SQL_QUERY: {sql_query}", "").strip()
                except Exception as e:
                    response = response.replace(f"SQL_QUERY: {sql_query}", f"")
                    response += f"\n\n❌ Error executing query: {str(e)}"
        
        # Convert datetime objects in sql_results to strings for JSON serialization
        if sql_results:
            sql_results = self._convert_datetime_objects(sql_results)
        
        return {
            "response": response,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "context_used": {
                "time_range": time_range,
                "total_transactions": context["stats"].get("total", 0),
                "high_risk_count": len(context.get("high_risk_transactions", []))
            },
            "sql_results": sql_results
        }
