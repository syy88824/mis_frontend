import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
// import MainPage from "./home";   
// import ReportPage from "./reportpage";  
// import EvaluationPage from "./evaluation";
import MainPage from "./home-1";   
import ReportPage from "./report-2";  
import EvaluationPage from "./evaluation-2";

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<MainPage />} />
        <Route path="/report" element={<ReportPage />} />
        <Route path="/evaluation" element={<EvaluationPage />} />
      </Routes>
    </Router>
  );
}

