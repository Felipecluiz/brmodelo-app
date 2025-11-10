# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

brModelo is a web-based database modeling and teaching tool supporting three modeling paradigms: Conceptual (Entity-Relationship), Logical (Relational), and NoSQL (Document-oriented). The application is built as an AngularJS + React hybrid using JointJS for diagram editing.

## Development Setup

### Prerequisites
- Node.js 20.x
- Yarn 1.x
- MongoDB 4.x running locally

### Initial Setup
```bash
yarn install
cp .env.example .env
# Ensure MongoDB is running
yarn start:frontend  # Port 9000
yarn start:dev       # Backend server
```

### Common Commands

**Development:**
- `yarn start:frontend` - Start webpack-dev-server with hot reload (port 9000)
- `yarn start:dev` - Start backend server in development mode with nodemon
- `yarn start` - Start production server

**Build:**
- `yarn build` - Production build (outputs to `app/dist/`)

**Testing:**
- `yarn test` - Run Jest unit tests with coverage
- `yarn test:watch` - Run Jest in watch mode
- `yarn test:cy` - Run Cypress E2E tests headless
- `yarn cy:open` - Open Cypress interactive test runner

**Test Setup:**
- Copy `cypress.env.example.json` to `cypress.env.json` with valid test credentials
- **Warning:** Test account data will be wiped during E2E tests

## Architecture Overview

### Hybrid Frontend: AngularJS + React

**Primary Framework: AngularJS 1.8.3** (~8,136 lines)
- Entry point: [app/angular/index.js](app/angular/index.js)
- UI-Router with lazy-loaded routes via ocLazyLoad
- Each modeling type is a separate lazy-loaded module

**React Integration** (7 TypeScript files, early migration stage)
- Bridge: `react2angular` wraps React components as AngularJS components
- Example: [app/react/components/Button/index.ts](app/react/components/Button/index.ts)
- TypeScript config: [app/react/tsconfig.json](app/react/tsconfig.json) with path aliases (`@components/*`, `@containers/*`, etc.)
- Pattern for gradual migration: create React component → wrap with react2angular → register as AngularJS component

### Three Modeling Paradigms

**1. Conceptual (Entity-Relationship)**
- Location: [app/angular/conceptual/](app/angular/conceptual/)
- Implements Chen's ER notation with custom JointJS shapes ([app/joint/shapes.js](app/joint/shapes.js))
- Shapes: Entity (rectangle), Relationship (diamond), Attribute (ellipse), ISA (triangle), etc.
- Key classes: `Factory`, `Validator`, `Linker`, `EntityExtensor`

**2. Logical (Relational)**
- Location: [app/angular/logic/](app/angular/logic/)
- Converts ER diagrams to relational tables via interactive conversion wizard
- Custom table shapes ([app/joint/table.js](app/joint/table.js)) with PK/FK annotations
- SQL generation: [app/angular/service/sqlGeneratorService.js](app/angular/service/sqlGeneratorService.js)
- Conversion engine: [app/angular/service/conversorService.js](app/angular/service/conversorService.js)

**3. NoSQL (Document-Oriented)**
- Location: [app/angular/nosql/](app/angular/nosql/)
- Document/collection modeling with embedded structures
- Shapes: [app/joint/shapesNosql.js](app/joint/shapesNosql.js)

### JointJS Integration

Each editor creates a JointJS workspace:
- `joint.dia.Graph` - Model (cell collection)
- `joint.dia.Paper` - Rendering canvas
- `joint.ui.EditorScroller` - Pan/zoom
- `joint.ui.EditorActions` - Undo/redo
- `joint.ui.ElementSelector` - Multi-select, copy/paste
- Keyboard shortcuts via `KeyboardController`

Models are serialized as JSON (`JSON.stringify(graph)`) and stored in MongoDB.

### Backend Structure

```
server_app/
  app.js              # Express setup, middleware, static serving
  model/
    handler.js        # Routes for model CRUD
    service.js        # Business logic
    model.js          # Mongoose schema
  user/
    handler.js        # Authentication routes
    service.js        # User logic (login, signup, recovery)
    model.js          # User schema
  helpers/
    config.js         # Environment config
    crypto.js         # RSA encryption/decryption
  middleware/         # JWT validation
  mail/              # Email services (password recovery)
```

**API Endpoints:**
- `GET /models?userId=xxx` - List user models
- `GET /models?modelId=xxx&userId=xxx` - Get specific model
- `POST /models` - Create model
- `PUT /models/:modelId` - Update model
- `DELETE /models?modelId=xxx` - Delete model
- `POST /users/login` - Authenticate (returns JWT)
- `POST /users/signup` - Register
- `POST /users/recovery` - Password reset

**Authentication Flow:**
1. Client encrypts credentials with RSA
2. Server decrypts and validates
3. JWT token generated on success
4. HTTP interceptor ([app/angular/service/interceptor.js](app/angular/service/interceptor.js)) injects token in `brx-access-token` header
5. Middleware validates JWT on protected routes

### Routing Structure

- `/` - Login page
- `/main` - Workspace (model list)
- `/conceptual/{modelid}` - Conceptual/ER editor
- `/logic/{references}` - Logical/Relational editor
- `/nosql/{modelid}` - NoSQL editor
- `/sql/{code}` - SQL code viewer
- `/preferences` - User settings
- `/publicview/{modelshareid}` - Public model sharing

All editor routes are lazy-loaded via dynamic imports.

### Key Services

**[app/angular/service/authService.js](app/angular/service/authService.js)**
- JWT authentication and session management
- Token storage and retrieval
- User info caching

**[app/angular/service/modelAPI.js](app/angular/service/modelAPI.js)**
- HTTP client for model CRUD operations
- Handles API URL prefixing

**[app/angular/service/conversorService.js](app/angular/service/conversorService.js)**
- Converts conceptual models to logical models
- Modal-driven interactive conversion
- Handles inheritance (three strategies), relationships (1:1, 1:N, N:M), associative entities

**[app/angular/service/sqlGeneratorService.js](app/angular/service/sqlGeneratorService.js)**
- Generates CREATE TABLE, ALTER TABLE, CREATE VIEW statements
- Handles PK, FK, constraints, JOINs

**[app/angular/service/logicService.js](app/angular/service/logicService.js)**
- Logic editor workspace management
- ~580 lines of core logic editor state

### Build System (Webpack 5)

**Entry:** [app/angular/index.js](app/angular/index.js)

**Output:** `app/dist/main.js` + `app/dist/bundle.css`

**Key Loaders:**
- `ts-loader` - TypeScript (React components)
- `babel-loader` - ES6+ transpilation with `angularjs-annotate` plugin
- `sass-loader` → `postcss-loader` → `css-loader` → `style-loader` - SASS pipeline
- `html-loader` - AngularJS templates

**Development:**
- webpack-dev-server on port 9000
- Hot module replacement
- Source maps enabled

**Production:**
- Terser minification
- Code splitting for vendor chunks
- No source maps

### Important Patterns

**Factory Pattern:** Each paradigm has a `Factory` class for creating JointJS shapes
```javascript
// conceptual/factory.js
factory.createEntity(config)
factory.createRelationship(config)
```

**Event-Driven Communication:**
- JointJS paper events: `paper.on('element:pointerup', ...)`
- AngularJS broadcasts: `$rootScope.$broadcast('element:select', ...)`
- Graph changes: `graph.on('change', ...)`

**Lazy Route Loading:**
```javascript
lazyLoad($transition$) {
  const $ocLazyLoad = $transition$.injector().get("$ocLazyLoad");
  return import("./conceptual/conceptual.js")
    .then(mod => $ocLazyLoad.inject(mod.default));
}
```

**Prevent Data Loss:**
- [app/angular/service/preventExitService.js](app/angular/service/preventExitService.js) guards against accidental navigation
- Checks `isDirty` flag before allowing page exit

## Code Conventions

### AngularJS Style
- Dependency injection via array notation or `angularjs-annotate` plugin
- Services use factory pattern
- Controllers use `controllerAs` syntax (e.g., `ctrl`)
- State-based routing with UI-Router

### React/TypeScript Style
- TypeScript strict mode enabled
- Path aliases: `@components/*`, `@containers/*`, `@pages/*`, `@enums/*`
- Styled-components for styling
- i18next for internationalization

### File Organization
- AngularJS: Each feature in its own directory with `[feature].js`, `[feature].html`, `sidebarControl.html`
- React: Component-based structure with index files exporting main component
- Services: Shared services in `app/angular/service/`
- JointJS shapes: `app/joint/` directory

## Testing

**Jest Configuration:** [jest.config.js](jest.config.js)
- Test environment: Node
- Roots: `app/` and `server_app/`

**Cypress Configuration:**
- Tests in [cypress/](cypress/)
- ESLint config: [cypress/.eslintrc.json](cypress/.eslintrc.json)

## Database Schema

**Model Schema** ([server_app/model/model.js](server_app/model/model.js)):
```javascript
{
  who: String,        // User ID
  name: String,       // Model name
  created: Date,
  updated: Date,
  model: Object,      // Serialized JointJS graph (JSON)
  type: String,       // "conceptual", "logic", "nosql"
  shareOptions: {
    active: Boolean,
    importAllowed: Boolean
  }
}
```

**User Schema** ([server_app/user/model.js](server_app/user/model.js)):
- Standard user fields: email, password (hashed), name
- Password reset tokens

## Migration Strategy: AngularJS → React

This codebase is in early-stage migration from AngularJS to React:

1. **Current State:** ~99% AngularJS, ~1% React
2. **Bridge:** `react2angular` allows React components to be used in AngularJS templates
3. **Pattern:** Create React component → wrap with `react2angular` → register as AngularJS component
4. **Example:** See [app/react/components/Button/index.ts](app/react/components/Button/index.ts)
5. **Strategy:** Gradual component-by-component migration, not big-bang rewrite

When adding new UI components, prefer React + TypeScript + styled-components following the existing Button pattern.

## Deployment

- **Production:** https://app.brmodeloweb.com
- **Staging:** https://brmodelo-stage.herokuapp.com/

## Important Notes

- **Do not commit to MongoDB connection strings with credentials** - use `.env` file
- **JWT secret** is in `.env` (`SECRET_TOKEN`)
- **Port configuration:** Frontend dev server uses 9000, backend uses port from `.env` (default 3000)
- **Data loss prevention:** Always check `isDirty` state before navigation
- **Model serialization:** JointJS graphs are stored as JSON objects in MongoDB
- **Keyboard shortcuts:** Defined per-editor using `KeyboardController`
