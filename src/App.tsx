import { Layout } from './components/Layout';

function App() {
  return (
    <Layout>
      <div className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
        <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <h1 className="mb-2 text-4xl font-bold tracking-tight text-brand-600 dark:text-brand-400">
            DeviceLab
          </h1>
          <p className="text-lg text-gray-500 dark:text-gray-400">
            Preview your web apps across different devices
          </p>
        </div>
        <p className="max-w-md text-center text-sm text-gray-400 dark:text-gray-500">
          DeviceLab helps developers identify responsive and layout problems by
          previewing web applications across multiple device configurations.
        </p>
      </div>
    </Layout>
  );
}

export default App;
