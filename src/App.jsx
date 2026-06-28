import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import InboxView from './pages/InboxView.jsx';
import SendersManager from './pages/SendersManager.jsx';
import SequenceList from './pages/SequenceList.jsx';
import SequenceDetail from './pages/SequenceDetail.jsx';
import TemplateList from './pages/TemplateList.jsx';
import TemplateEditor from './pages/TemplateEditor.jsx';
import EnrollmentMonitor from './pages/EnrollmentMonitor.jsx';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to="/inbox" replace />} />
        <Route path="/inbox" element={<InboxView />} />
        <Route path="/senders" element={<SendersManager />} />
        <Route path="/sequences" element={<SequenceList />} />
        <Route path="/sequences/new" element={<SequenceDetail />} />
        <Route path="/sequences/:id" element={<SequenceDetail />} />
        <Route path="/templates" element={<TemplateList />} />
        <Route path="/templates/new" element={<TemplateEditor />} />
        <Route path="/templates/:id" element={<TemplateEditor />} />
        <Route path="/enrollments" element={<EnrollmentMonitor />} />
        <Route path="*" element={<Navigate to="/inbox" replace />} />
      </Route>
    </Routes>
  );
}
