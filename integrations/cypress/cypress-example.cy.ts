/**
 * api-schema-differentiator + Cypress Example
 *
 * For Cypress, use the CLI approach via cy.exec() since Cypress
 * runs in the browser and can't import Node modules directly.
 *
 * Install:  npm install api-schema-differentiator
 * Run:      npx cypress run
 */

describe('API Schema Drift Tests', () => {
  it('GET /api/users/:id — no breaking schema drift', () => {
    cy.request('GET', 'https://api.example.com/v2/users/1').then((response) => {
      // Write response to a temp file
      const fileName = `tmp-response-${Date.now()}.json`;
      cy.writeFile(`cypress/fixtures/${fileName}`, response.body);

      // Run api-schema-differentiator CLI
      cy.exec(
        `npx api-schema-differentiator check -k "GET /api/v2/users/:id" -d cypress/fixtures/${fileName} -s ./schemas --fail-on breaking`,
        { failOnNonZeroExit: true }
      );

      // Clean up
      cy.exec(`del cypress\\fixtures\\${fileName}`, { failOnNonZeroExit: false });
    });
  });

  it('GET /api/products — schema is stable', () => {
    cy.request('GET', 'https://api.example.com/v2/products').then((response) => {
      const fileName = `tmp-response-${Date.now()}.json`;
      cy.writeFile(`cypress/fixtures/${fileName}`, response.body);

      cy.exec(
        `npx api-schema-differentiator check -k "GET /api/v2/products" -d cypress/fixtures/${fileName} -s ./schemas --fail-on breaking`,
        { failOnNonZeroExit: true }
      );

      cy.exec(`del cypress\\fixtures\\${fileName}`, { failOnNonZeroExit: false });
    });
  });
});

