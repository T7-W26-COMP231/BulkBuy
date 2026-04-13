export const SocketContext = createContext();

export const SocketProvider = ({ children }) => {
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    const onMessage = (msg) => setMessages((prev) => [...prev, msg]);
    
    socket.on('message', onMessage);
    return () => socket.off('message', onMessage);
  }, []);

  return (
    <SocketContext.Provider value={{ messages }}>
      {children}
    </SocketContext.Provider>
  );
};