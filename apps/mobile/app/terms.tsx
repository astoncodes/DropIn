import { termsOfUse } from '../src/features/legal/documents';
import { LegalDocumentScreen } from '../src/features/legal/legal-document-screen';

export default function TermsRoute() {
  return <LegalDocumentScreen document={termsOfUse()} />;
}
