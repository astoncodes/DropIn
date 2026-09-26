import { privacyPolicy } from '../src/features/legal/documents';
import { LegalDocumentScreen } from '../src/features/legal/legal-document-screen';

export default function PrivacyRoute() {
  return <LegalDocumentScreen document={privacyPolicy()} />;
}
