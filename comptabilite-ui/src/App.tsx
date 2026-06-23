import { AppRoutes } from './routes/AppRoutes';
import { DialogProvider } from './components/DialogProvider';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import './index.css';

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <div className="App">
        <DialogProvider />
        <AppRoutes />
      </div>
    </QueryClientProvider>
  );
}

export default App;
