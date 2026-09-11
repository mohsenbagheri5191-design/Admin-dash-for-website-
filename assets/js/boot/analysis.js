/** Entry point for the analysis dashboard page. Kept as a file rather than an
 *  inline <script> so the Content Security Policy can stay script-src 'self'. */
import { boot } from '../views/analysis.js';
boot();
