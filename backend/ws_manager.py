"""
FDT WebSocket Manager
Handles real-time WebSocket connections for Send Money feature
"""

import json
from typing import Dict, List
from datetime import datetime

class WebSocketManager:
    def __init__(self):
        """Initialize the WebSocket manager"""
        self.active_connections: Dict[str, List] = {}  # user_id -> list of connections
        self.connection_info: Dict = {}  # connection -> user_id, connected_at

    async def connect(self, websocket, user_id: str):
        """Accept and register a WebSocket connection"""
        await websocket.accept()
        
        # Store connection
        if user_id not in self.active_connections:
            self.active_connections[user_id] = []
        
        self.active_connections[user_id].append(websocket)
        self.connection_info[websocket] = {
            "user_id": user_id,
            "connected_at": datetime.now()
        }
        
        print(f"✓ WebSocket connected: user {user_id} (total: {len(self.active_connections)})")

    def disconnect(self, websocket):
        """Remove a WebSocket connection"""
        if websocket in self.connection_info:
            user_id = self.connection_info[websocket]["user_id"]
            
            # Remove from user's connections
            if user_id in self.active_connections:
                if websocket in self.active_connections[user_id]:
                    self.active_connections[user_id].remove(websocket)
                
                # Clean up empty user entries
                if not self.active_connections[user_id]:
                    del self.active_connections[user_id]
            
            # Remove connection info
            del self.connection_info[websocket]
            
            print(f"✗ WebSocket disconnected: user {user_id}")

    async def send_personal_message(self, websocket, message: dict):
        """Send a message to a specific WebSocket connection"""
        try:
            await websocket.send_text(json.dumps(message))
        except Exception as e:
            print(f"Error sending personal message: {e}")

    async def send_to_user(self, user_id: str, message: dict):
        """Send a message to all connections for a specific user"""
        if user_id in self.active_connections:
            message_str = json.dumps(message)
            disconnected_connections = []
            
            for connection in self.active_connections[user_id]:
                try:
                    await connection.send_text(message_str)
                except Exception as e:
                    print(f"Error sending to user {user_id}: {e}")
                    disconnected_connections.append(connection)
            
            # Clean up dead connections
            for connection in disconnected_connections:
                self.disconnect(connection)

    async def broadcast_to_all(self, message: dict):
        """Broadcast a message to all connected users"""
        message_str = json.dumps(message)
        all_disconnected = []
        
        for user_id, connections in self.active_connections.items():
            disconnected_for_user = []
            
            for connection in connections:
                try:
                    await connection.send_text(message_str)
                except Exception as e:
                    print(f"Error broadcasting to user {user_id}: {e}")
                    disconnected_for_user.append(connection)
            
            all_disconnected.extend(disconnected_for_user)
        
        # Clean up dead connections
        for connection in all_disconnected:
            self.disconnect(connection)

    def get_connection_count(self):
        """Get total number of active connections"""
        return sum(len(connections) for connections in self.active_connections.values())

    def get_user_count(self):
        """Get number of unique connected users"""
        return len(self.active_connections)

    def is_user_connected(self, user_id: str):
        """Check if a user is currently connected"""
        return user_id in self.active_connections and len(self.active_connections[user_id]) > 0

# Global WebSocket manager instance
ws_manager = WebSocketManager()